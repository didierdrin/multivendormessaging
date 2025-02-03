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

let globalFlowId = null; // Initialize flow ID at startup

// Mock product list
const mockProducts = [
  {
    id: "prod1",
    name: "Fanta Orange 33 CL",
    description: "Soft drink, glass bottle.",
    imageUrl: "iVBORw0KGgU5ErkJggg==", // Your base64 image string
    price: "500 RWF"
  },
  {
    id: "prod2",
    name: "Fanta Citron 50 CL",
    description: "Soft drink, plastic bottle.",
    imageUrl: "iVBORw0ujklajdsfljasdjfC", // Your base64 image string
    price: "800 RWF"
  },
  {
    id: "prod3",
    name: "Coca Cola 50 CL",
    description: "Soft drink, plastic bottle.",
    imageUrl: "base64string3", // Your base64 image string
    price: "800 RWF"
  }
];

//
// 1. Generate Dynamic Flow Structure
//
function generateDynamicFlow(mockProducts) {
  // Create opt-in options for each product
  const productOptIns = mockProducts.map((product, index) => ({
    label: `${product.name} - ${product.price}`,
    name: `${product.name.replace(/\s+/g, '_')}_${product.id}`,
    required: true,
    type: "OptIn",
    "on-click-action": {
      name: "navigate",
      next: {
        name: `OPTIN_SCREEN_screen_${product.id}`,
        type: "screen"
      },
      payload: {}
    }
  }));

  // Create a detail screen for each product
  const productScreens = mockProducts.map(product => ({
    id: `OPTIN_SCREEN_screen_${product.id}`,
    layout: {
      children: [
        {
          children: [
            {
              text: `${product.name}\n${product.description}\nPrice: ${product.price}`,
              type: "TextBody"
            },
            {
              height: 400,
              "scale-type": "contain",
              src: product.imageUrl,
              type: "Image"
            }
          ],
          name: "flow_path",
          type: "Form"
        }
      ],
      type: "SingleColumnLayout"
    },
    title: "Details"
  }));

  // Note: The "data" field has been removed from the first component.
  return {
    name: "menuoneflow",
    language: { code: "en_US" },
    category: ["MARKETING"],
    components: [
      {
        id: "QUESTION_THREE",
        layout: {
          children: [
            {
              children: [
                { type: "TextHeading", text: "Our products" },
                ...productOptIns,
                {
                  label: "Done",
                  "on-click-action": {
                    name: "complete",
                    payload: Object.fromEntries(
                      mockProducts.map((product, index) => [
                        `screen_0_${product.name.replace(/\s+/g, '_')}_${index}`,
                        `\${form.${product.name.replace(/\s+/g, '_')}_${product.id}}`
                      ])
                    )
                  },
                  type: "Footer"
                }
              ],
              name: "flow_path",
              type: "Form"
            }
          ],
          type: "SingleColumnLayout"
        },
        terminal: true,
        title: "Icupa App"
      },
      ...productScreens
    ],
    version: "6.3"
  };
}

function generateAndLogFlow() {
  try {
    const dynamicFlow = generateDynamicFlow(mockProducts);
    console.log('Generated Flow Structure:', JSON.stringify(dynamicFlow, null, 2));
    return dynamicFlow;
  } catch (error) {
    console.error('Error generating flow:', error);
    throw error;
  }
}

//
// 2. Create WhatsApp Flow via the API
//
const whatsappAPI = {
  createFlow: async (flowStructure) => {
    try {
      console.log('Attempting to create flow with structure:', JSON.stringify(flowStructure, null, 2));

      const flowResponse = await axios.post(
        `https://graph.facebook.com/${VERSION}/191711990692012/flows`,
        flowStructure,
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log('Flow creation response:', JSON.stringify(flowResponse.data, null, 2));

      if (!flowResponse.data.id) {
        throw new Error('Flow ID not received in response');
      }

      return flowResponse.data.id;
    } catch (error) {
      console.error('Error creating flow:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }
};

async function initializeFlow(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to initialize flow`);
      const flow = generateAndLogFlow();

      if (!flow.name || !flow.components || !flow.language) {
        throw new Error('Invalid flow structure generated');
      }

      console.log('Generated valid flow structure');
      const flowId = await whatsappAPI.createFlow(flow);

      if (!flowId) {
        throw new Error('Flow ID not received');
      }

      console.log('Successfully initialized flow with ID:', flowId);
      return flowId;
    } catch (error) {
      console.error(`Flow initialization attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        console.error('Maximum retry attempts reached');
        throw error;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

//
// 3. Send WhatsApp Message With Flow Template (menu2)
//
async function sendSecondCatalog(phone, phoneNumberId, flowId) {
  if (!flowId) {
    console.error('Flow ID is not available');
    return;
  }

  // Note: The parameter key has been changed from "flow_token" to "payload"
  const payload = {
    type: "template",
    template: {
      name: "menuone", // This must match the template name in your Meta dashboard.
      language: { code: "en_US" },
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "flow",
              payload: flowId
            }
          ]
        }
      ]
    }
  };

  try {
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
    console.log('Successfully sent catalog with flow ID:', flowId);
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

    case "menu2":
      console.log("User requested menu2 with flowId:", globalFlowId);
      if (!globalFlowId) {
        console.error('Flow ID not available');
        return;
      }
      await sendSecondCatalog(phone, phoneNumberId, globalFlowId);
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
    globalFlowId = await initializeFlow();
    if (!globalFlowId) {
      throw new Error('Failed to initialize flow');
    }

    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Server running on port ${port} with flow ID: ${globalFlowId}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
