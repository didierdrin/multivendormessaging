import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import admin from "firebase-admin";
import { readFileSync } from 'fs';
import path from 'path';

// Path to the service account key stored in Render secrets
const serviceAccountPath = '/etc/secrets/serviceAccountKey.json';

// Read and parse the service account JSON file
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));


// Initialize Firebase Admin SDK (ensure GOOGLE_APPLICATION_CREDENTIALS is set or use a serviceAccount)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://icupa-396da.firebaseio.com"
});
const firestore = admin.firestore();

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://multivendormessaging.onrender.com"
    ],
    methods: ["GET", "POST"],
    credentials: true
  })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- WhatsApp & Global Config ---
const ACCESS_TOKEN =
  "EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";
const VERSION = "v22.0";

// In-memory contexts per phone (to track order & ordering stage)
const userContexts = new Map();
const processedMessages = new Set(); // Prevent duplicate processing

// --- Helper: Firestore Data Fetching ---
// Fetches all docs from a given collection and returns an object mapping doc.id to data.
async function fetchData(collectionName) {
  const snapshot = await firestore.collection(collectionName).get();
  const docs = {};
  snapshot.forEach((doc) => {
    docs[doc.id] = { id: doc.id, ...doc.data() };
  });
  return docs;
}


// Returns rows for the current page (max 10 rows per page)
function paginateRows(rows, page = 0, pageSize = 9) {
  const start = page * pageSize;
  return rows.slice(start, start + pageSize);
}


// --- 1. Send Menu Message (Interactive List) ---
// This function fetches the merged menu items from Firestore and sends an interactive list message.
async function sendMenuMessage(phone, phoneNumberId) {
  try {
    // Fetch and merge data from Firestore as before...
    const [vendorGoods, vendors, goods, categories, vendorProducts] =
      await Promise.all([
        fetchData("vendorGoods"),
        fetchData("vendors"),
        fetchData("goods"),
        fetchData("categories"),
        fetchData("vendorProducts")
      ]);

    const mergedData = Object.values(vendorGoods).map((goodsItem) => {
      const vendorProduct = Object.values(vendorProducts).find(
        (vp) => vp.id === goodsItem.product
      );
      const good = vendorProduct
        ? goods[vendorProduct.product]
        : goods[goodsItem.product];
      const vendor = vendors[goodsItem.vendor];
      const categoriesMapped = (goodsItem.categories || []).map(
        (catId) => (categories[catId] && categories[catId].name?.en) || "Unknown Category"
      );
      return {
        id: goodsItem.id,
        productName: good?.name || "Unknown Product",
        vendor: vendor?.name || "Unknown Vendor",
        price: goodsItem.price || vendorProduct?.price || 0,
        categories: categoriesMapped,
        stock: goodsItem.stock || vendorProduct?.stock || 0,
        createdOn: goodsItem.createdOn
          ? (goodsItem.createdOn.toDate ? goodsItem.createdOn.toDate().toLocaleString() : goodsItem.createdOn)
          : "Unknown Date"
      };
    });

    // Maximum lengths per WhatsApp guidelines removed 1 character for safer (or your recommendations)
const MAX_TITLE_LENGTH = 23;
const MAX_DESCRIPTION_LENGTH = 71;

// Helper function to truncate strings and append "..." if truncated
function truncateString(str, maxLength) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

    // Build list rows for all items.
    // When mapping your mergedData to list rows, apply the truncation:
const allRows = mergedData.map((item) => {
  // Truncate product name for the title
  const truncatedTitle = truncateString(item.productName, MAX_TITLE_LENGTH);
  
  // Compose the full description string
  const fullDescription = `Vendor: ${item.vendor} | Price: ${item.price} | Categories: ${item.categories.join(", ")}`;
  
  // Truncate the description to the maximum allowed length
  const truncatedDescription = truncateString(fullDescription, MAX_DESCRIPTION_LENGTH);
  
  return {
    id: item.id, // When selected, this ID is returned.
    title: truncatedTitle,
    description: truncatedDescription
  };
});

    // Retrieve the current page from user context; default to 0.
    let userContext = userContexts.get(phone) || { order: [], page: 0 };
    const currentPage = userContext.page || 0;

    // Get rows for the current page
    let rows = paginateRows(allRows, currentPage, 9);
    //let rows = allRows.slice(0, 9);
    
    // Check if there are more items after this page.
    const hasMore = (currentPage + 1) * 10 < allRows.length;
    if (hasMore) {
      // Add an extra row for "More Items"
      rows.push({
        id: "MORE_ITEMS",
        title: "More Items",
        description: "Tap to see more products"
      });
    }

    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "Menu Items"
        },
        body: {
          text: "Select a product to add to your order:"
        },
        action: {
          button: "Select Product",
          sections: [
            {
              title: "Products",
              rows: rows
            }
          ]
        }
      }
    };

    await sendWhatsAppMessage(phone, payload, phoneNumberId);
  } catch (error) {
    console.error("Error in sendMenuMessage:", error.message);
  }
}

// --- 2. Send Order Prompt ---
// After a user selects a product, ask if they want to add more items.
async function sendOrderPrompt(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Would you like to add more items to your order?"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "MORE",
              title: "More"
            }
          },
          {
            type: "reply",
            reply: {
              id: "ORDER",
              title: "That's It"
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// --- 3. Send Order Summary ---
// When the user indicates they are done, send a summary of the items ordered.
async function sendOrderSummary(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const order = userContext.order || [];

  if (order.length === 0) {
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: { body: "You have not ordered any items yet." }
    }, phoneNumberId);
    return;
  }

  // For simplicity, we list only the product IDs that were ordered.
  // In a real implementation, you might store more details (e.g. product name, price) in the context.
  const summaryText =
    "Order Summary:\n" + order.map((id, idx) => `${idx + 1}. Product ID: ${id}`).join("\n");

  await sendWhatsAppMessage(phone, {
    type: "text",
    text: { body: summaryText }
  }, phoneNumberId);

  // Optionally clear the user's context.
  userContexts.delete(phone);
}

// --- 4. Generic WhatsApp Message Sender ---
const sendWhatsAppMessage = async (phone, messagePayload, phoneNumberId) => {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        ...messagePayload
      }
    });
    console.log(`Message sent successfully from ${phoneNumberId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(
      `WhatsApp message sending error from ${phoneNumberId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
};

// --- 5. Handling Interactive Replies ---
// When a user selects a menu item or taps a button, process the interactive response.
async function handleInteractiveMessage(message, phone, phoneNumberId) {
  // Check for a list reply (menu selection)
  if (message.interactive?.list_reply) {
    const selectedId = message.interactive.list_reply.id;
    if (selectedId === "MORE_ITEMS") {
      // User tapped "More Items": Increment page and resend menu.
      let userContext = userContexts.get(phone) || { order: [], page: 0 };
      userContext.page = (userContext.page || 0) + 1;
      userContexts.set(phone, userContext);
      await sendMenuMessage(phone, phoneNumberId);
    } else {
      // Normal product selection: Save product ID.
      console.log(`User selected product: ${selectedId}`);
      let userContext = userContexts.get(phone) || { order: [], page: 0 };
      userContext.order.push(selectedId);
      // Reset pagination so next menu shows the first page.
      userContext.page = 0;
      userContexts.set(phone, userContext);

      // Follow up with order prompt (asking "More" or "That's It")
      await sendOrderPrompt(phone, phoneNumberId);
    }
  }
  // Handle button replies (for "More" or "That's It") as before.
  else if (message.interactive?.button_reply) {
    const buttonId = message.interactive.button_reply.id;
    console.log(`Button reply received: ${buttonId}`);
    if (buttonId === "MORE") {
      // Send the menu again for an additional selection.
      await sendMenuMessage(phone, phoneNumberId);
    } else if (buttonId === "ORDER") {
      // Show order summary.
      await sendOrderSummary(phone, phoneNumberId);
    }
  }
}


// --- 6. Handle Incoming Text Messages ---
// (For non-interactive messages and commands.)
const handleTextMessages = async (message, phone, phoneNumberId) => {
  const messageText = message.text.body.trim().toLowerCase();

  switch (messageText) {
    case "adminclear":
      userContexts.clear();
      console.log("All user contexts reset.");
      break;
    case "clear":
      userContexts.delete(phone);
      console.log("User context reset.");
      break;
    case "test":
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "This is the test message" }
        },
        phoneNumberId
      );
      break;
    case "menu":
      // Start ordering by sending the menu interactive list.
      await sendMenuMessage(phone, phoneNumberId);
      break;
    default:
      console.log(`Received unrecognized text message: ${messageText}`);
  }
};

// --- 7. Main Message Handler ---
// Now we handle both text and interactive message types.
async function handlePhoneNumber1Logic(message, phone, changes, phoneNumberId) {
  if (message.type === "text") {
    await handleTextMessages(message, phone, phoneNumberId);
  } else if (message.type === "interactive") {
    await handleInteractiveMessage(message, phone, phoneNumberId);
  } else {
    console.log("Unrecognized message type:", message.type);
  }
}

// --- 8. Webhook Endpoint ---
app.post("/webhook", async (req, res) => {
  if (req.body.object === "whatsapp_business_account") {
    const changes = req.body.entry?.[0]?.changes?.[0];
    const messages = changes.value?.messages;
    const phoneNumberId = changes.value?.metadata?.phone_number_id;

    if (!changes || !messages || !phoneNumberId) {
      return res.status(400).send("Invalid payload.");
    }

    const message = messages[0];
    const phone = message.from;
    const uniqueMessageId = `${phoneNumberId}-${message.id}`;

    if (processedMessages.has(uniqueMessageId)) {
      console.log("Duplicate message ignored:", uniqueMessageId);
      return res.sendStatus(200);
    }
    processedMessages.add(uniqueMessageId);

    try {
      // Use your known phoneNumberId (e.g., "189923527537354") or adjust as needed.
      if (phoneNumberId === "189923527537354") {
        await handlePhoneNumber1Logic(message, phone, changes, phoneNumberId);
      } else {
        console.warn("Unknown phone number ID:", phoneNumberId);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    } finally {
      // Clean up duplicate tracking after 5 minutes
      setTimeout(() => processedMessages.delete(uniqueMessageId), 300000);
    }
  }
  res.sendStatus(200);
});

// --- 9. Webhook Verification ---
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "icupatoken31";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Verification failed!");
    }
  }
});

// --- 10. Start the Server ---
const startServer = async () => {
  try {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
