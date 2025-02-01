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
      await sendSecondCatalog(phone, phoneNumberId);
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

const getStaticMenu2 = () => {
    return {
        "Food": {
            "Starters": [
                { "id": "F1", "name": "Spring Rolls", "price": 4.50, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" },
                { "id": "F2", "name": "Chicken Wings", "price": 6.00, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ],
            "Main Course": [
                { "id": "F3", "name": "Beef Burger", "price": 8.00, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ]
        },
        "Drinks": {
            "Beers": [
                { "id": "B1", "name": "Heineken", "price": 3.00, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ],
            "Cocktails": [
                { "id": "C1", "name": "Mojito", "price": 6.50, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ]
        }
    };
};

// Function to send a media message (image)
const sendMediaMessage2 = async (phone, imageUrl, caption, phoneNumberId) => {
    const payload = {
        type: "image",
        image: {
            link: imageUrl,
            caption: caption
        }
    };
    return sendWhatsAppMessage(phone, payload, phoneNumberId);
};

// Function to send the catalog request
const sendCatalogRequest2 = async (phone, phoneNumberId) => {
    const menu = getStaticMenu();
    let menuText = "📜 *MENU*\n";
    
    for (const [className, categories] of Object.entries(menu)) {
        menuText += `\n🍽️ *${className.toUpperCase()}*\n`;
        for (const [categoryName, items] of Object.entries(categories)) {
            menuText += `\n➖ *${categoryName.toUpperCase()}*\n`;
            items.forEach(item => {
                menuText += `✅ ${item.id}. ${item.name} - $${item.price} [Select]\n`;
            });
        }
    }

    // Send the menu text first
    await sendWhatsAppMessage(phone, { type: "text", text: { body: menuText } }, phoneNumberId);

    // Send images for each item
    for (const [className, categories] of Object.entries(menu)) {
        for (const [categoryName, items] of Object.entries(categories)) {
            for (const item of items) {
                const caption = `🍽️ *${item.name}* - $${item.price}\n${item.description || ""}`;
                await sendMediaMessage(phone, item.image, caption, phoneNumberId);
            }
        }
    }
};


//---------------------

const getStaticMenu = () => {
    return {
        "Food": {
            "Starters": [
                { "id": "F1", "name": "Spring Rolls", "price": 4.50, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" },
                { "id": "F2", "name": "Chicken Wings", "price": 6.00, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ],
            "Main Course": [
                { "id": "F3", "name": "Beef Burger", "price": 8.00, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ]
        },
        "Drinks": {
            "Beers": [
                { "id": "B1", "name": "Heineken", "price": 3.00, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
            ],
            "Cocktails": [
                { "id": "C1", "name": "Mojito", "price": 6.50, "image": "https://res.cloudinary.com/dezvucnpl/image/upload/v1732548205/image_2024-11-25_172320646_yzvjon.png" }
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
                    image: item.image
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


async function sendSecondCatalog(phone, phoneNumberId) {
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
