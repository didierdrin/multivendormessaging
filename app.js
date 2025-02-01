import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import http from "http";
import https from "https";
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

//----------




// ____________________________________

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

    case "menu":
      console.log("User requested the menu.");
      await sendCatalogRequest(phone, phoneNumberId);
      break;
    case "menu2":
      console.log("User requested the menu.");
      await sendSecondCatalog(phone, phoneNumberId, flowId);
      break;
    

    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};




  
  async function handlePhoneNumber1Logic(message, phone, changes, phoneNumberId) {
    switch (message.type) {
              
  
              case "text":
                await handleTextMessages(message, phone, phoneNumberId);
                
                
                //await handleNumberOfPeople(message, phone, phoneNumberId);
                
                break;
  
             
  
             
  
              default:
                console.log("Unrecognized message type:", message.type);
            }
  }
  



  
  
  

const processedMessages = new Set();



// Webhook endpoint for receiving messages
app.post("/webhook", async (req, res) => {
    if (req.body.object === "whatsapp_business_account") {
        const changes = req.body.entry?.[0]?.changes?.[0];
        const messages = changes.value?.messages;
        const phoneNumberId = changes.value?.metadata?.phone_number_id;

        if (!changes || !messages || !phoneNumberId) {
            return res.status(400).send("Invalid payload.");
        }

        // Only process the first message in the array
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

  



// Webhook verification
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




// __________________________________


const sendWhatsAppMessage = async (phone, messagePayload, phoneNumberId) => {
    try {
        const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
        const response = await axios({
            method: "POST",
            url: url,
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            data: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phone,
                ...messagePayload,
            },
        });
        console.log(`Message sent successfully from ${phoneNumberId}:`, response.data);
        return response.data;
    } catch (error) {
        console.error(`WhatsApp message sending error from ${phoneNumberId}:`, error.response?.data || error.message);
        throw error;
    }
};



//---------------------

const getStaticMenu = () => {
    return {
        "Food": {
            "Starters": [
                { "id": "F1", "name": "Spring Rolls", "price": 4050, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" },
                { "id": "F2", "name": "Chicken Wings", "price": 6000, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ],
            "Main Course": [
                { "id": "F3", "name": "Beef Burger", "price": 8000, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ]
        },
        "Drinks": {
            "Beers": [
                { "id": "B1", "name": "Heineken", "price": 3000, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ],
            "Cocktails": [
                { "id": "C1", "name": "Mojito", "price": 6050, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ]
        }
    };
};

// Function to send an interactive list message
const sendInteractiveListMessage = async (phone, menu, phoneNumberId) => {
    const sections = [];

    for (const [className, categories] of Object.entries(menu)) {
        const rows = [];
        for (const [categoryName, items] of Object.entries(categories)) {
            items.forEach(item => {
                rows.push({
                    id: item.id,
                    title: item.name,
                    description: `$${item.price}`,
                    //image: item.image
                });
            });
        }
        sections.push({
            title: className.toUpperCase(),
            rows: rows
        });
    }

    const payload = {
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: "📜 MENU"
            },
            body: {
                text: "Here's our menu. Select an item to learn more!"
            },
            action: {
                button: "View Menu",
                sections: sections
            }
        }
    };

    return sendWhatsAppMessage(phone, payload, phoneNumberId);
};

// Handle catalog request
const sendCatalogRequest = async (phone, phoneNumberId) => {
    const menu = getStaticMenu();
    await sendInteractiveListMessage(phone, menu, phoneNumberId);
};

//------------------

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

function generateDynamicFlow(mockProducts) {
  // Generate OptIn components for each product
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

  // Generate detail screens for each product
  const productScreens = mockProducts.map(product => ({
    //data: {},
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

  // Generate the complete flow structure with supported language code
  

    return {
  name: "menuoneflow",
  language: { code: "en_US" }, 
  category: "MARKETING",    // Added category
  components: [
    {
      data: {},
      id: "QUESTION_THREE",
      layout: {
        children: [
          {
            children: [
              {
                type: "TextHeading",
                text: "Our products"
              },
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

// Function to send the WhatsApp message with the flow
async function sendSecondCatalog(phone, phoneNumberId, flowId) {
  const payload = {
    type: "template",
    template: {
      name: "menuone",
      language: {
        code: "en_US",
      },
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "payload",
              payload: flowId,
            },
          ],
        },
      ],
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Example usage
function generateAndLogFlow() {
  try {
    const dynamicFlow = generateDynamicFlow(mockProducts);
    console.log(JSON.stringify(dynamicFlow, null, 2));
    return dynamicFlow;
  } catch (error) {
    console.error('Error generating flow:', error);
  }
}

// Generate and log the flow structure
const flow = generateAndLogFlow();


// WhatsApp API function

const whatsappAPI = {
  createFlow: async (flowStructure) => {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/${VERSION}/191711990692012/message_templates`,
        {
          name: flowStructure.name,
          category: flowStructure.category,
          language: { code: "en_US" },
          components: flowStructure.components.map(component => ({
            id: component.id,
            layout: component.layout,
            terminal: component.terminal,
            title: component.title
          }))
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log("Template creation response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Template creation error:", error.response?.data || error);
      throw error;
    }
  }
};


// get the flowId
async function updateWhatsAppFlow(flow) {
    const response = await whatsappAPI.createFlow(flow);
    return response.flowId; 
}

const flowId = await updateWhatsAppFlow(flow);

//-------------


async function sendSecondCatalogSave(phone, phoneNumberId) {
  const payload = {
    type: "template",
    template: {
      name: "menuone", 
      language: {
        code: "en_US", // Replace with the appropriate language code
      },
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "payload",
              payload: "974841610643366", 
            },
          ],
        },
      ],
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}


app.post("/api/get-menu", async (req, res) => {
    try {
        const { phone, phoneNumberId } = req.body;
        await sendCatalogRequest(phone, phoneNumberId);
        res.status(200).send("Menu sent successfully");
    } catch (error) {
        res.status(500).send("Error fetching menu");
    }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
