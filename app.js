// App.js
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { firestore } from "./firebaseConfig.js";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
//import admin from 'firebase-admin';


// Custom HTTP and HTTPS Agents
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

// Set longer timeout and more robust connection settings
axios.defaults.timeout = 60000 * 3; // 3 minutes
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://multivendormessaging.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(bodyParser.json());

// WhatsApp API Credentials
const ACCESS_TOKEN = "EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";
  
//const PHONE_NUMBER_ID = 
const VERSION = "v22.0";

// Global in-memory store for user contexts
const userContexts = new Map();
//userContexts.clear()

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});



//// From here - readable modular functions.

const handleMobileMoneySelection = async (buttonId, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone);
  if (!userContext) {
    console.log("No user context found for phone:", phone);
    return;
  }

  const vendorNumber = userContext.vendorNumber || "+250788767816"; // Default to Rwanda
  const currentCurrency = userContext.currency || "RWF"; // Default to Rwanda
  let callToActionMessage = "";

  if (currentCurrency === "RWF") {
    // Payment messages for Rwanda
    if (buttonId === "mtn_momo") {
      callToActionMessage = `Please pay with\nMTN MoMo to ${vendorNumber}, name Global In One LTD\n____________________\nYour order is being processed and will be delivered soon.`;
    } else if (buttonId === "airtel_mobile_money") {
      callToActionMessage = `Please pay with\nAirtel Money to ${vendorNumber}, name Global In One LTD\n____________________\nYour order is being processed and will be delivered soon.`;
    } else {
      console.log("Unrecognized mobile money option for Rwanda:", buttonId);
      return;
    }
  } else if (currentCurrency === "XOF") {
    // Payment messages for Togo
    if (buttonId === "mtn_momo") {
      callToActionMessage = `Veuillez payer avec\nMTN Mobile Money au ${vendorNumber}, nom Global In One LTD\n____________________\nVotre commande est en cours de traitement et sera livrée sous peu.`;
    } else if (buttonId === "airtel_mobile_money") {
      callToActionMessage = `Veuillez payer avec\nAirtel Money au ${vendorNumber}, nom Global In One LTD\n____________________\nVotre commande est en cours de traitement et sera livrée sous peu.`;
    } else {
      console.log("Unrecognized mobile money option for Togo:", buttonId);
      return;
    }
  } else {
    console.log("Unsupported currency:", currentCurrency);
    return;
  }

  const redirectPayload = {
    type: "text",
    text: { body: callToActionMessage },
  };

  await sendWhatsAppMessage(phone, redirectPayload, phoneNumberId);
};



const handleOrder = async (message, changes, displayPhoneNumber, phoneNumberId) => {
  const order = message.order;
  const orderId = message.id;
  const customerInfo = {
    phone: changes.value.contacts[0].wa_id,
    receiver: displayPhoneNumber,
  };
  const items = order.product_items;
  const totalAmount = items.reduce(
    (total, item) => total + item.item_price * item.quantity,
    0
  );

  // Save the order details into userContext
  const userContext = userContexts.get(customerInfo.phone) || {};
  userContext.order = {
    orderId,
    customerInfo,
    items,
    totalAmount,
  };
  userContexts.set(customerInfo.phone, userContext);

  try {
    

    // Send location request message
    const locationRequestPayload = {
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: {
          text: "Share your delivery location",
        },
        action: {
          name: "send_location",
        },
      },
    };

    await sendWhatsAppMessage(customerInfo.phone, locationRequestPayload, phoneNumberId);
    console.log("Order saved successfully.");
  } catch (error) {
    console.error("Error saving order:", error.message);
  }
};




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

    case "catalog":
      console.log("User requested the menu.");
      await sendDefaultCatalog(phone, phoneNumberId);
      break;
    case "gio":
      console.log("User requested the menu.");
      await sendDefaultCatalog(phone, phoneNumberId);
      break;

   

    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};






const handleLocation = async (location, phone, phoneNumberId) => {
  try {
    // Retrieve the order from userContext
    const userContext = userContexts.get(phone);
    
    if (!userContext || !userContext.order) {
      console.log("No order found in user context.");
      await sendWhatsAppMessage(phone, {
        type: "text",
        text: {
          body: "No active order found. Please place an order first.",
        },
      }, phoneNumberId);
      return;
    }

    // Extract order details from userContext
    const { orderIdx, customerInfo, items } = userContext.order;

    // Fetch catalog products for enrichment
    const catalogProducts = await fetchFacebookCatalogProducts();

    // Enrich items with product details
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );
      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });

    // Determine vendor and currency
    const currencies = enrichedItems[0].currency;
    let vendorNumber = "+250788767816"; // Default Rwanda
    let currentCurrency = "RWF";
    let countryCodeText = "RW";
    
    if (currencies === "XOF") {
      vendorNumber = "+22892450808"; // Togo
      currentCurrency = "XOF";
      let countryCodeText = "TG";
    }

    function orderNumber() {
      const randomNum = Math.floor(1 + Math.random() * (10000000 - 1)); // Generates a number between 1 and 9999999
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const formattedNum = randomNum.toString().padStart(6, "0"); // Convert to string and pad with leading zeros if needed

      return `ORD-${dateStr}-${formattedNum}`;
    }

    const orderidd = orderNumber();
    
    // Prepare order data for Firebase
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      countryCode: countryCodeText,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      //deliveryAddress: "xx KG yy Ave",
      deliveryLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
      }
    };

    // Save directly to Firebase
    const docRef = await firestore.collection("whatsappOrders").add(orderData);
    console.log("Order saved successfully to Firebase with ID:", docRef.id);

    // Send the TIN request to the customer
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: {
        body: "Please provide your TIN(e.g., 101589140) or 0 if no TIN:",
      },
    }, phoneNumberId);

    // Update user context to expect TIN input
    userContext.vendorNumber = vendorNumber;
    userContext.currency = currentCurrency;
    userContext.stage = "EXPECTING_TIN";
    userContexts.set(phone, userContext);

    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error.message);
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: {
        body: `Sorry, there was an error processing your location: ${error.message}. Please try again.`,
      },
    }, phoneNumberId);
  }
};



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





  async function handlePhoneNumber1Logic(message, phone, changes, phoneNumberId) {
    switch (message.type) {
              case "order":
                await handleOrder(
                  message,
                  changes,
                  changes.value.metadata.display_phone_number,
                  phoneNumberId
                );
                break;
  
              case "text":
                await handleTextMessages(message, phone, phoneNumberId);
               
                const userContext = userContexts.get(phone) || {};
                if (userContext.stage === "EXPECTING_TIN") {
                  const tin = message.text.body.trim();
                  if (tin) {
                    console.log(`User ${phone} provided TIN: ${tin}`);
                    // Store the TIN or process it as required
                    // Update the context to expect the location
                    //userContext.tin = tin;  // Save the TIN
                    userContext.stage = "EXPECTING_MTN_AIRTEL"; // Move to location stage
                    userContexts.set(phone, userContext);
  
                    await sendWhatsAppMessage(phone, {
                      type: "interactive",
                      interactive: {
                        type: "button",
                        body: {
                          text: "Proceed to payment",
                        },
                        action: {
                          buttons: [
                            { type: "reply", reply: { id: "mtn_momo", title: "MTN MoMo" } },
                            {
                              type: "reply",
                              reply: { id: "airtel_mobile_money", title: "Airtel Money" },
                            },
                          ],
                        },
                      },
                    }, phoneNumberId);
  
                    return;  // Exit early after processing TIN
                  } else {
                    await sendWhatsAppMessage(phone, {
                      type: "text",
                      text: {
                        body: "Invalid TIN. Please provide a valid TIN.",
                      },
                    }, phoneNumberId);
                    return;
                  }
                }
                break;
  
              case "interactive":
                if (message.interactive.type === "button_reply") {
                  const buttonId = message.interactive.button_reply.id;
  
                  // Only process if MENU pay
                  const userContext = userContexts.get(phone) || {};
             
                  if (userContext.stage === "EXPECTING_MTN_AIRTEL") {
                    await handleMobileMoneySelection(buttonId, phone, phoneNumberId);
                    console.log("Expecting MTN & AIRTEL button reply");
                    return;
                  }
                } 
                break;
             
  
              case "location":
                await handleLocation(message.location, phone, phoneNumberId);
                break;
  
              default:
                console.log("Unrecognized message type:", message.type);
            }
  }
  
  
  
  
  
  



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

// Function to format phone number
const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
};

// Function to test WhatsApp connection
async function testWhatsAppConnection() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/me`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    console.log("WhatsApp connection test successful:", response.data);
    return true;
  } catch (error) {
    console.error(
      "WhatsApp connection test failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

// Unified message sending function
async function sendWhatsAppMessage(phone, messagePayload, phoneNumberId) {
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
        to: formatPhoneNumber(phone),
        ...messagePayload,
        // Add verified name details
        // context: {
        //     verified_name: {
        //         name: "Global In One LTD"
        //     }
        // }
      },
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
}


// new catalog with sections
async function sendDefaultCatalog(phone, phoneNumberId) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: {
          type: "text",  // The header type should be "image" to support both image and text
          text: "Global In One LTD"  // You can include text along with the image
        },
        body: { text: "Order & get fast delivery!" },
        action: {
          catalog_id: "1128955182287808",
          sections: [
            {
              title: "Our Products",
              product_items: [
               
                { product_retailer_id: "wywp40g4ce" },
                { product_retailer_id: "j262675ijh" },
                { product_retailer_id: "u3ls74gyjy" },
                { product_retailer_id: "0yxp4rom0m" }, 
                { product_retailer_id: "hwmi9t3sux" },
                
               
              ],
            },
          ],
        },
      },
    };

    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });

    console.log("Default catalog sent successfully to:", phone);
    return response.data;
  } catch (error) {
    console.error(
      "Error sending default catalog:",
      error.response?.data || error.message
    );
    throw error;
  }
}




// Route to manually trigger a message
app.post("/api/send-message", async (req, res) => {
  try {
    const result = await sendDefaultCatalog(req.body.phone, 888);
    res.status(200).json({
      success: true,
      message: "Message sent successfully!",
      response: result,
    });
  } catch (error) {
    const errorMessage =
      error?.response?.data?.error?.message ||
      error?.message ||
      "An unknown error occurred";

    const statusCode = error?.response?.status || 500;

    res.status(statusCode).json({
      success: false,
      message: "Failed to send message",
      error: errorMessage,
    });
  }
});


app.post("/api/save-order", async (req, res) => {
  console.log("Incoming order data:", req.body);

  const { orderId, customerInfo, items, deliveryLocation } = req.body;

  try {
    // Validate incoming data
    if (!orderId || !customerInfo || !items || items.length === 0) {
      return res.status(400).json({ message: "Invalid order data" });
    }

    // Fetch all catalog products to enrich order items
    const catalogProducts = await fetchFacebookCatalogProducts();

    // Enrich items with product details from Facebook Catalog
    const enrichedItems = items.map((item) => {
      const productDetails = catalogProducts.find(
        (product) => product.retailer_id === item.product_retailer_id
      );

      return {
        product: item.product_retailer_id,
        quantity: item.quantity,
        price: item.item_price,
        currency: item.currency,
        product_name: productDetails?.name || "Unknown Product",
        product_image: productDetails?.image_url || "defaultImage.jpg",
      };
    });

    // Determine the vendor number based on currency
    const currencies = enrichedItems[0].currency; //enrichedItems.map((item) => item.currency);
    let vendorNumber = "+250788767816"; // Default to Rwandan number
    let currentCurrency = "RWF";
    // currencies.includes("XOF")
    if (currencies == "XOF") {
      vendorNumber = "+22892450808"; // Togo number
      currentCurrency = "XOF"; // Togo currency
    }

    let currentOrder = 0;
    
   
    
    function orderNumber() {
      
      
      const randomNum = uuidv4().split('-')[0];
      currentOrder += 1;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      //return `ORD-${dateStr}-${randomNum.toString()}`;
      // Format the random number to always be 6 digits
      const formattedNum = randomNum.slice(0, 6).padStart(6, "0");
  
      return `ORD-${dateStr}-${formattedNum}`;
      //randomNum.toString().padStart(6, "0")}
    }

    const orderidd = orderNumber();

    // Prepare Firestore document data
    const orderData = {
      orderId: orderidd,
      phone: customerInfo.phone,
      currency: currentCurrency,
      amount: enrichedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      products: enrichedItems,
      user: `+${customerInfo.phone}`,
      date: new Date(),
      paid: false,
      rejected: false,
      served: false,
      accepted: false,
      vendor: vendorNumber,
      deliveryLocation: deliveryLocation || null // Add location data
    };

    // Save order to Firestore
    const docRef = await firestore.collection("whatsappOrders").add(orderData);

    console.log("Order saved successfully with ID:", docRef.id);

    res
      .status(200)
      .json({ message: "Order saved successfully", order: orderData });
  } catch (error) {
    console.error("Error saving order:", error.message);
    res
      .status(500)
      .json({ message: "An error occurred while saving the order" });
  }
});


async function fetchFacebookCatalogProducts() {
  const url = `https://graph.facebook.com/v12.0/1128955182287808/products?fields=id,name,description,price,image_url,retailer_id`;
  let products = [];
  let nextPage = url;

  try {
    while (nextPage) {
      const response = await axios.get(nextPage, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      });

      // Append fetched products to the list
      products = products.concat(response.data.data);

      // Update nextPage with the next page link
      nextPage = response.data.paging?.next || null;
    }

    console.log("Fetched products with images:", products);
    return products;
  } catch (error) {
    console.error(
      "Error fetching catalog products:",
      error.response?.data || error.message
    );
    throw error;
  }
}




// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  testWhatsAppConnection();
});
