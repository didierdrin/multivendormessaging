import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();

app.use(cors({
  origin: ["http://localhost:3000", "https://multivendormessaging.onrender.com"],
  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(bodyParser.json());

const ACCESS_TOKEN = "EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";
const VERSION = "v22.0";

const userContexts = new Map();
const processedMessages = new Set(); // <-- Ensure this is declared


// -------------

// 5. Send WhatsApp Message with Deep Link to External Webview (Multi‑Select Menu)
//
async function sendDeepLinkMessage(phone, phoneNumberId) {
  // Generate a unique session token
  const sessionToken = uuidv4();
  // Create the deep link URL for your external menu page.
  const deepLinkUrl = `https://multivendormessaging.onrender.com/menu?session=${sessionToken}`;

  const payload = {
    type: "text",
    text: {
      body: `Hello! Please click the link to view our menu and select your items: ${deepLinkUrl}`
    }
  };

  try {
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
    console.log('Deep link message sent successfully.');
  } catch (error) {
    console.error('Error sending deep link message:', error);
    throw error;
  }
}

//
// 9. External Webview Routes for Multi‑Select Menu
//
app.get("/menu", (req, res) => {
  // Extract the session token from query parameters
  const session = req.query.session || "";
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Menu</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1, h2 { color: #333; }
        label { display: block; margin-bottom: 10px; }
        .section { margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>Our Menu</h1>
      <form action="/submit-menu" method="POST">
        <!-- Pass along the session token -->
        <input type="hidden" name="session" value="${session}" />

        <div class="section">
          <h2>Food - Starters</h2>
          <label>
            <input type="checkbox" name="items" value="F1" />
            Spring Rolls - 40.50
          </label>
          <label>
            <input type="checkbox" name="items" value="F2" />
            Chicken Wings - 60.00
          </label>
        </div>

        <div class="section">
          <h2>Food - Main Course</h2>
          <label>
            <input type="checkbox" name="items" value="F3" />
            Beef Burger - 80.00
          </label>
        </div>

        <div class="section">
          <h2>Drinks - Beers</h2>
          <label>
            <input type="checkbox" name="items" value="B1" />
            Heineken - 30.00
          </label>
        </div>

        <div class="section">
          <h2>Drinks - Cocktails</h2>
          <label>
            <input type="checkbox" name="items" value="C1" />
            Mojito - 60.50
          </label>
        </div>

        <button type="submit">Submit</button>
      </form>
    </body>
    </html>
  `);
});

app.post("/submit-menu", (req, res) => {
  const session = req.body.session || "";
  let selectedItems = req.body.items;
  
  // Ensure selectedItems is always an array
  if (!Array.isArray(selectedItems)) {
    selectedItems = selectedItems ? [selectedItems] : [];
  }
  
  console.log(`Session: ${session}`);
  console.log('Selected items:', selectedItems);

  // Process the selected items as needed (e.g., store in a database)
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Thank You!</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
      </style>
    </head>
    <body>
      <h1>Thank you for your selection!</h1>
      <p>You have selected: ${selectedItems.join(', ') || 'No items'}</p>
    </body>
    </html>
  `);
});


async function sendTestMessage(phone, phoneNumberId) {
  

  // Note: The parameter key has been changed from "flow_token" to "payload"
  const payload = {
    type: "text",
    text: {
      body: "This is the test message",
    }
  };

  try {
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
    console.log('Successfully sent catalog with flow ID:', globalFlowId);
  } catch (error) {
    console.error('Error sending catalog:', error);
    throw error;
  }
}

//
// 4. Send WhatsApp Message (generic)
//
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
    console.error(`WhatsApp message sending error from ${phoneNumberId}:`, error.response?.data || error.message);
    throw error;
  }
};

const dynamicData = {
  product1_name: "Fanta Orange 33 CL - 500 RWF",
  product1_details: "Fanta Orange 33 CL Bralirwa\nSoft drink, glass bottle.",
  product1_image: "iVBORw0KGgU5ErkJggg==",
  product2_name: "Fanta Citron 50 CL - 800 RWF",
  product2_details: "Fanta Citron 50 CL Bralirwa\nSoft drink, plastic bottle.",
  product2_image: "iVBORw0ujklajdsfljasdjfC",
  product3_name: "Coca Cola 50 CL - 800 RWF",
  product3_details: "Coca Cola 50 CL Bralirwa\nSoft drink, plastic bottle.",
  product3_image: "base64string3"
};

async function sendThirdCatalog(phone, phoneNumberId, flowIdUnique, dynamicData) {
  if (!flowIdUnique) {
    console.error('Flow ID is not available');
    return;
  }

  // Combine the flow ID and dynamic product data into a single payload object.
  // The keys here should match the placeholder names in your published template.
  const dynamicPayload = {
    flowId: flowIdUnique,
    ...dynamicData
  };

  // Depending on your integration, the WhatsApp API may expect a JSON string.
  // We use JSON.stringify here to be safe.
  const payload = {
    type: "template",
    template: {
      name: "menuonedynamic", // Must match the template name published in your Meta dashboard.
      language: { code: "en_US" },
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "payload",
              payload: JSON.stringify(dynamicPayload)
            }
          ]
        }
      ]
    }
  };

  try {
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
    console.log('Successfully sent catalog with flow ID:', flowIdUnique);
  } catch (error) {
    console.error('Error sending catalog:', error);
    throw error;
  }
}



//
// 5. Handle Incoming Text Messages
//
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

    case "webmenu":
      // Trigger sending the deep link message for the external web view
      await sendDeepLinkMessage(phone, phoneNumberId);
      break;
      
    case "test":
      await sendTestMessage(phone, phoneNumberId); //globalFlowId
      break;
      
    
    case "menu3":
      await sendThirdCatalog(phone, phoneNumberId, "3801441796771301", dynamicData); 
      break;

    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};

async function handlePhoneNumber1Logic(message, phone, changes, phoneNumberId) {
  switch (message.type) {
    case "text":
      await handleTextMessages(message, phone, phoneNumberId);
      break;

    default:
      console.log("Unrecognized message type:", message.type);
  }
}

//
// 6. Webhook Endpoint
//
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
      if (phoneNumberId === "189923527537354") {
        await handlePhoneNumber1Logic(message, phone, changes, phoneNumberId);
      } else {
        console.warn("Unknown phone number ID:", phoneNumberId);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    } finally {
      setTimeout(() => processedMessages.delete(uniqueMessageId), 300000);
    }
  }

  res.sendStatus(200);
});

//
// 7. Webhook Verification
//
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

//
// 8. Start the Server & Initialize the Flow
//
const startServer = async () => {
  try {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
