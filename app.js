import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";

// Path to the service account key stored in your environment (for example, in Render secrets)
const serviceAccountPath = "/etc/secrets/serviceAccountKey.json";
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

// Initialize Firebase Admin SDK using the service account
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

// In-memory contexts per phone (to track ordering stage, selections, order list, pagination, etc.)
const userContexts = new Map();
const processedMessages = new Set(); // Prevent duplicate processing

// --- Helper: Firestore Data Fetching ---
// Fetch all documents from a given collection and return an object mapping doc.id to data.
async function fetchData(collectionName) {
  const snapshot = await firestore.collection(collectionName).get();
  const docs = {};
  snapshot.forEach((doc) => {
    docs[doc.id] = { id: doc.id, ...doc.data() };
  });
  return docs;
}

// --- Helper: Pagination ---
// Returns rows for the current page (with pageSize items per page)
function paginateRows(rows, page = 0, pageSize = 9) {
  const start = page * pageSize;
  return rows.slice(start, start + pageSize);
}

// --- Helper: String Truncation ---
// Enforce maximum lengths for title and description.
const MAX_TITLE_LENGTH = 23;
const MAX_DESCRIPTION_LENGTH = 71;
function truncateString(str, maxLength) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

// --- 1. Send Class Selection Message ---
// When "menu" is received, prompt the user to select a class (Foods or Drinks).
async function sendClassSelectionMessage(phone, phoneNumberId) {
  let userContext = userContexts.get(phone) || {};
  userContext.stage = "CLASS_SELECTION";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: "Select a Class" },
      body: { text: "Choose one of the following:" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CLASS_FOODS", title: "Foods" } },
          { type: "reply", reply: { id: "CLASS_DRINKS", title: "Drinks" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// --- 2. Send Category Selection Message ---
// Based on the chosen class, fetch categories from "mt_categories" and send them.
async function sendCategorySelectionMessage(phone, phoneNumberId, selectedClass) {
  try {
    const categoriesData = await fetchData("mt_categories");
    // Filter categories where the "classes" field matches the selected class (case-insensitive)
    const filteredCategories = Object.values(categoriesData).filter(
      (cat) => cat.classes.toLowerCase() === selectedClass.toLowerCase()
    );

    // Map filtered categories to interactive list rows with truncation.
    const allRows = filteredCategories.map((cat) => {
      return {
        id: cat.id,
        title: truncateString(cat.name, MAX_TITLE_LENGTH),
        description: truncateString(cat.description, MAX_DESCRIPTION_LENGTH)
      };
    });

    // Use pagination (max 9 rows per page)
    let userContext = userContexts.get(phone) || { order: [], page: 0 };
    const currentPage = userContext.page || 0;
    let rows = paginateRows(allRows, currentPage, 9);
    const hasMore = (currentPage + 1) * 9 < allRows.length;
    if (hasMore) {
      rows.push({
        id: "MORE_ITEMS",
        title: "More Items",
        description: "Tap to see more categories"
      });
    }

    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Categories" },
        body: { text: "Select a category:" },
        action: {
          button: "Select Category",
          sections: [
            {
              title: "Categories",
              rows: rows
            }
          ]
        }
      }
    };

    userContext.stage = "CATEGORY_SELECTION";
    userContexts.set(phone, userContext);
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
  } catch (error) {
    console.error("Error in sendCategorySelectionMessage:", error.message);
  }
}

// --- 3. Send Product Selection Message ---
// Based on the selected class and category, fetch products from "mt_subcategories" and send them.
async function sendProductSelectionMessage(phone, phoneNumberId, selectedClass, selectedCategory) {
  try {
    const productsData = await fetchData("mt_subcategories");
    // Filter products: active === true, classes match, and subcategory equals the selected category id.
    const filteredProducts = Object.values(productsData).filter((prod) => {
      return (
        prod.active === true &&
        prod.classes.toLowerCase() === selectedClass.toLowerCase() &&
        prod.subcategory === selectedCategory
      );
    });

    // Map products to interactive list rows with truncation.
    const allRows = filteredProducts.map((prod) => {
      const fullDescription = `Price: ${prod.price} | ${prod.description}`;
      return {
        id: prod.id,
        title: truncateString(prod.name, MAX_TITLE_LENGTH),
        description: truncateString(fullDescription, MAX_DESCRIPTION_LENGTH)
      };
    });

    // Use pagination for products.
    let userContext = userContexts.get(phone) || { order: [], page: 0 };
    const currentPage = userContext.page || 0;
    let rows = paginateRows(allRows, currentPage, 9);
    const hasMore = (currentPage + 1) * 9 < allRows.length;
    if (hasMore) {
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
        header: { type: "text", text: "Products" },
        body: { text: "Select a product:" },
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

    userContext.stage = "PRODUCT_SELECTION";
    userContexts.set(phone, userContext);
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
  } catch (error) {
    console.error("Error in sendProductSelectionMessage:", error.message);
  }
}

// --- 4. Send Order Prompt ---
// After a product selection, ask the user if they want to add more items or finish the order.
async function sendOrderPrompt(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Would you like to add more items to your order?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "MORE", title: "More" } },
          { type: "reply", reply: { id: "ORDER", title: "That's It" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// --- 5. Send Order Summary ---
// When the user finishes ordering, send a summary of the order.
async function sendOrderSummary(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const order = userContext.order || [];

  if (order.length === 0) {
    await sendWhatsAppMessage(
      phone,
      { type: "text", text: { body: "You have not ordered any items yet." } },
      phoneNumberId
    );
    return;
  }

  const summaryText =
    "Order Summary:\n" +
    order.map((id, idx) => `${idx + 1}. Product ID: ${id}`).join("\n");

  await sendWhatsAppMessage(
    phone,
    { type: "text", text: { body: summaryText } },
    phoneNumberId
  );

  // Optionally clear the user context after finalizing the order.
  userContexts.delete(phone);
}

// --- 6. Generic WhatsApp Message Sender ---
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

// --- 7. Handling Interactive Replies ---
// Process interactive replies based on the current stage stored in the user context.
async function handleInteractiveMessage(message, phone, phoneNumberId) {
  let userContext = userContexts.get(phone) || {};

  switch (userContext.stage) {
    case "CLASS_SELECTION":
      if (message.interactive?.button_reply) {
        const classId = message.interactive.button_reply.id; // "CLASS_FOODS" or "CLASS_DRINKS"
        const selectedClass = classId === "CLASS_FOODS" ? "Foods" : "Drinks";
        userContext.selectedClass = selectedClass;
        userContext.stage = "CATEGORY_SELECTION";
        userContexts.set(phone, userContext);
        await sendCategorySelectionMessage(phone, phoneNumberId, selectedClass);
      }
      break;

    case "CATEGORY_SELECTION":
      if (message.interactive?.list_reply) {
        const categoryId = message.interactive.list_reply.id;
        if (categoryId === "MORE_ITEMS") {
          // Pagination for categories
          userContext.page = (userContext.page || 0) + 1;
          userContexts.set(phone, userContext);
          await sendCategorySelectionMessage(phone, phoneNumberId, userContext.selectedClass);
        } else {
          userContext.selectedCategory = categoryId;
          userContext.stage = "PRODUCT_SELECTION";
          userContext.page = 0; // Reset pagination for product selection
          userContexts.set(phone, userContext);
          await sendProductSelectionMessage(
            phone,
            phoneNumberId,
            userContext.selectedClass,
            categoryId
          );
        }
      }
      break;

    case "PRODUCT_SELECTION":
      if (message.interactive?.list_reply) {
        const selectedId = message.interactive.list_reply.id;
        if (selectedId === "MORE_ITEMS") {
          // Pagination for products
          userContext.page = (userContext.page || 0) + 1;
          userContexts.set(phone, userContext);
          await sendProductSelectionMessage(
            phone,
            phoneNumberId,
            userContext.selectedClass,
            userContext.selectedCategory
          );
        } else {
          // Normal product selection: add the product to the order.
          if (!userContext.order) userContext.order = [];
          userContext.order.push(selectedId);
          userContext.stage = "ORDER_PROMPT";
          userContext.page = 0; // Reset page in case further selections are made later
          userContexts.set(phone, userContext);
          await sendOrderPrompt(phone, phoneNumberId);
        }
      }
      break;

    case "ORDER_PROMPT":
      if (message.interactive?.button_reply) {
        const buttonId = message.interactive.button_reply.id;
        if (buttonId === "MORE") {
          userContext.stage = "PRODUCT_SELECTION";
          userContexts.set(phone, userContext);
          await sendProductSelectionMessage(
            phone,
            phoneNumberId,
            userContext.selectedClass,
            userContext.selectedCategory
          );
        } else if (buttonId === "ORDER") {
          await sendOrderSummary(phone, phoneNumberId);
        }
      }
      break;

    default:
      console.log("Unhandled stage in interactive message:", userContext.stage);
  }
}

// --- 8. Handle Incoming Text Messages ---
// For plain text commands.
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
        { type: "text", text: { body: "This is the test message" } },
        phoneNumberId
      );
      break;
    case "menu":
      // Start the ordering flow by sending the class selection message.
      await sendClassSelectionMessage(phone, phoneNumberId);
      break;
    default:
      console.log(`Received unrecognized text message: ${messageText}`);
  }
};

// --- 9. Main Message Handler ---
// Handle both text and interactive messages.
async function handlePhoneNumber1Logic(message, phone, changes, phoneNumberId) {
  if (message.type === "text") {
    await handleTextMessages(message, phone, phoneNumberId);
  } else if (message.type === "interactive") {
    await handleInteractiveMessage(message, phone, phoneNumberId);
  } else {
    console.log("Unrecognized message type:", message.type);
  }
}

// --- 10. Webhook Endpoint ---
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
      // Adjust the phoneNumberId check as needed.
      if (phoneNumberId === "189923527537354") {
        await handlePhoneNumber1Logic(message, phone, changes, phoneNumberId);
      } else {
        console.warn("Unknown phone number ID:", phoneNumberId);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    } finally {
      // Remove the message from duplicate tracking after 5 minutes.
      setTimeout(() => processedMessages.delete(uniqueMessageId), 300000);
    }
  }
  res.sendStatus(200);
});

// --- 11. Webhook Verification ---
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

// --- 12. Start the Server ---
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
