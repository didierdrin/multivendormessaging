// APP
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { firestore, storage } from "./firebaseConfig.js";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import admin from "firebase-admin";
//import { extractImageData } from './imageExtraction.js';
const bucketName = "gs://assigurw.appspot.com";
const bucket = storage.bucket(bucketName);

dotenv.config();

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
    origin: ["http://localhost:3000", "https://assigurwmessaging-i.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(bodyParser.json());

// WhatsApp API Credentials
const ACCESS_TOKEN =
  "EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";//"EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD"; //"EAA1kZAGvg8CkBO7CvHgw7vOETU2TPYwnzqBtJMKm08L3u3iaCau2J98glnWGkbx1A80bHrCvRK8lZA4ZB4diboE0ACxtqUOG4bR0LU6uqUWxsd6cRRaDQZBJTJt6LDLZCEMKw4h87ixIhRyTfwoSzphuUMDCVjsQBmOjsWCqn0WhcWTS7UESldlis6OL5fz0Tp7teEsKX8iIWOcoAVZAf3SEF1lfMZD";//"EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";//"EAA1kZAGvg8CkBO24xE3Nh1NvIOrZAHhEt6N1w6LBa0gLxpK3KZCYZBBeFroUunZCYvJhwFgXblw2rsxkRLkAThSSHgmzvO2ArQKq9kvsHkQQSzrK7pYy0bJktsrPzad3XLbpVwgG9WDbz2ZC5DHLtee99GMjqXxM9C3RbZBZALGz7n7dYl6ydJwMYagLADh0TAZCrOC3MiTe7Yq3Tvx4n9pKISPZB5QIsZD";

const VERSION = "v22.0";

// Global in-memory store for user contexts
const userContexts = new Map();
//userContexts.clear()

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});

// Update the plate number validation function
function validatePlateNumber(plateNumber) {
  // More flexible validation
  const cleanedPlateNumber = plateNumber.replace(/\s+/g, "").toUpperCase();

  // Relaxed regex to match various plate number formats
  const plateNumberRegex = /^[A-Z]{2,3}\d{2,4}[A-Z]?$/;

  console.log("Plate Number Validation:", {
    input: plateNumber,
    cleaned: cleanedPlateNumber,
    isValid: plateNumberRegex.test(cleanedPlateNumber),
  });

  return {
    isValid: plateNumberRegex.test(cleanedPlateNumber),
    formattedPlateNumber: cleanedPlateNumber,
  };
}

const validateDate = (dateString) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD format
  if (!dateRegex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

//// From here - readable modular functions.

const handlePlateNumberValidation = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone);
  const messageText = message.text.body.trim().toLowerCase();
  const PLATE_NUMBER_REGEX = /^[a-zA-Z]{3}\s?\d{3}[a-zA-Z]?$/i;

  // Check if we're expecting a plate number
  if (PLATE_NUMBER_REGEX.test(messageText)) {
    const plateNumberInput = message.text.body.trim();
    const { isValid, formattedPlateNumber } =
      validatePlateNumber(plateNumberInput);

    console.log("Plate Number Validation Result:", {
      input: plateNumberInput,
      isValid: isValid,
      formattedPlateNumber: formattedPlateNumber,
    });

    if (isValid) {
      await selectInsurancePeriod(phone, formattedPlateNumber, phoneNumberId);
    } else {
      // Send error message for invalid plate number
      const errorPayload = {
        type: "text",
        text: {
          body: "Invalid plate number format. Please use a valid format like RAC345T or RAC 345 T:",
        },
      };
      await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);

      // Optional: Re-trigger plate number request
      await requestVehiclePlateNumber(phone, phoneNumberId);
    }
  }
};

const handleDateValidation = async (message, phone, phoneNumberId) => {
  const DATE_REGEX = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
  const messageText = message.text.body.trim();

  // Validate date format
  if (DATE_REGEX.test(messageText)) {
    try {
      // Additional validation for date validity
      const [day, month, year] = messageText.split("/").map(Number);
      const inputDate = new Date(year, month - 1, day);

      // Check if date is valid and not in the past
      const isValidDate =
        inputDate.getFullYear() === year &&
        inputDate.getMonth() === month - 1 &&
        inputDate.getDate() === day &&
        inputDate >= new Date(); // Ensures date is not in the past

      if (isValidDate) {
        console.log("Date Validation Result:", {
          input: messageText,
          isValid: true,
          formattedDate: messageText,
        });

        // Store the insurance start date in userContext
        const userContext = userContexts.get(phone) || {};
        userContext.insuranceStartDate = inputDate;
        userContexts.set(phone, userContext);

        // Handle different stages
        switch (userContext.stage) {
          case "EXPECTING_START_DATE":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_END_DATE";
            userContexts.set(phone, userContext);
            await endDate(phone, phoneNumberId);
            break;

          case "EXPECTING_END_DATE":
            const startDate = userContext.insuranceStartDate;
            //if (inputDate >= startDate) {
            //await sendWhatsAppMessage(phone, {
            // type: "text",
            // text: {
            //   body: "End date must be after the start date. Please enter a valid end date."
            //  }
            // }, phoneNumberId);
            //  return;
            // }
            userContext.insuranceEndDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            break;

          case "CUSTOM_DATE_INPUT":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            break;

          default:
            console.log("Unexpected stage for date input:", userContext.stage);
            break;
        }

        // Proceed to next step: selecting insurance cover type
        //await selectInsuranceCoverType(phone, phoneNumberId);
      } else {
        // Send error message for invalid date
        const errorPayload = {
          type: "text",
          text: {
            body: "Invalid date. Please enter a valid future date in DD/MM/YYYY format. For example: 15/12/2024",
          },
        };
        await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);
      }
    } catch (error) {
      console.error("Date validation error:", error);
      const errorPayload = {
        type: "text",
        text: {
          body: "There was an error processing the date. Please try again with a valid date in DD/MM/YYYY format.",
        },
      };
      await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);
    }
  }
};

// New comprehensive message handling functions
const handleNFMReply = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};

  try {
    // Safely parse the flow response
    const flowResponse = message.interactive.nfm_reply.response_json;
    const userResponse = JSON.parse(flowResponse);

    // Use optional chaining and provide a default empty array
    const selectedCoverTypes = userResponse.screen_0_question3Checkbox_0 || [];

    // Validate input
    if (!Array.isArray(selectedCoverTypes)) {
      console.warn(
        `Invalid cover types for phone ${phone}:`,
        selectedCoverTypes
      );
      return;
    }

    console.log("User selected cover types:", selectedCoverTypes);

    // Process specific cover type
    if (selectedCoverTypes.includes("0_Third-Party_Cover_")) {
      userContext.thirdPartyComesaCost = 14000;
      await selectToAddPersonalAccidentCover(phone, phoneNumberId);
    }

    // Process specific cover type
    if (selectedCoverTypes.includes("1_COMESA_Cover")) {
      userContext.thirdPartyComesaCost = 10000;
      await selectToAddPersonalAccidentCover(phone, phoneNumberId);
    }

    // Update user context
    //const userContext = userContexts.get(phone) || {};
    userContext.selectedCoverTypes = selectedCoverTypes;
    userContexts.set(phone, userContext);
  } catch (error) {
    console.error(`Error processing NFM reply for phone ${phone}:`, error);
    // Optionally, you might want to handle the error more gracefully
    // For example, send an error message back to the user
  }
};

const handlePaymentTermsReply = async (
  replyId,
  phone,
  userContext,
  phoneNumberId
) => {
  switch (replyId) {
    case "quantity_1":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "500kg";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_2":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "1Ton";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_3":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "2Tons";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_4":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "4Tons";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_5":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "5Tons";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_more":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAdditionalQuantityMessage(phone, phoneNumberId);
        return;
      }

      break;
    case "seats_1":
      //if (userContext.stage === "EXPECTING_SEATS") {
      await sendAvailableDriversMessage(phone, phoneNumberId);
      userContext.seats = "1";
      userContexts.set(phone, userContext);
      //  return;
      // }

      break;
    case "seats_2":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "2";
        userContexts.set(phone, userContext);
        return;
      }

      break;

    case "seats_3":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "3";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "seats_4":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "4";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "seats_5":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "5";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "seats_more":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAdditionalSeatsMessage(phone, phoneNumberId);
        return;
      }

      break;
    case "pickup_later":
      if (userContext.stage === "EXPECTING_NOW_LATER") {
        await sendCustomPickupTimeMessage(phone, phoneNumberId);
        return;
      } else if (userContext.stage === "EXPECTING_NOW_LATER_GOODS") {
        await sendCustomPickupTimeMessageGoods(phone, phoneNumberId);
        return;
      } else {
        console.log("Not the right button");
      }

      break;
    case "pickup_now":
      if (userContext.stage === "EXPECTING_NOW_LATER") {
        await sendSeatSelectionMessage(phone, phoneNumberId);
        return;
      } else if (userContext.stage === "EXPECTING_NOW_LATER_GOODS") {
        await sendQuantitySelectionMessage(phone, phoneNumberId);
        return;
      } else {
        console.log("Not the right button");
      }

      break;
    case "less_than_a_year":
      if (userContext.stage === "EXPECTING_STATE_INSURANCE_DURATION") {
        await startDate(phone, phoneNumberId);
        return;
      }

      break;
    case "full_year":
      if (userContext.stage === "EXPECTING_STATE_INSURANCE_DURATION") {
        await selectInsurancePeriod(
          phone,
          userContext.formattedPlate,
          phoneNumberId
        );
        return;
      }

      break;

    case "add_yes":
      if (userContext.stage === "PERSONAL_ACCIDENT_COVER") {
        await selectPersonalAccidentCategory(phone, phoneNumberId);
        console.log("Expecting CAT1.../FULL PAYMENT button reply");
        return;
      }

      break;
    case "add_no":
      // Calculate total cost
      //const coverageCost = userContext.selectedCoverage || 0;
      userContext.selectedCoverage = 0; // Price for CAT 0 None
      const coverageCost = userContext.thirdPartyComesaCost;
      userContext.totalCost = 1 * coverageCost;

      userContext.stage = null;
      //userContext.numberOfCoveredPeople = 1;
      userContexts.set(phone, userContext);

      await selectPaymentPlan(phone, phoneNumberId);
      break;
    case "agree_to_terms":
      console.log("User agreed to the terms. Proceeding with payment.");
      await processPayment(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "cancel_payment":
      console.log("User canceled the payment.");
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Payment has been canceled. Let us know if you need anything else!",
          },
        },
        phoneNumberId
      );
      break;
    case "start_today":
      if (userContext.stage === "EXPECTING_INSURANCE_PERIOD") {
        // Store the insurance start date in userContext
        const today = new Date();
        const formattedDate = `${today
          .getDate()
          .toString()
          .padStart(2, "0")}/${(today.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${today.getFullYear()}`;
        userContext.insuranceStartDate = formattedDate;
        userContexts.set(phone, userContext);
        await selectInsuranceCoverType(phone, phoneNumberId);
        console.log("Expecting start_today button reply");
        return;
      }

      break;

    case "custom_date":
      if (userContext.stage === "EXPECTING_INSURANCE_PERIOD") {
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: {
              body: "Please enter your desired start date (DD/MM/YYYY, 02/01/2025):",
            },
          },
          phoneNumberId
        );
        userContext.stage = "CUSTOM_DATE_INPUT";
        userContexts.set(phone, userContext);
        console.log("Expecting custom_date button reply");
        return;
      }

      break;

    default:
      console.log("Unknown payment response:", replyId);
  }
};

const handleNumberOfPeople = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};

  if (userContext.stage === "EXPECTING_NUMBER_OF_PEOPLE") {
    const messageText = message.text.body.trim();
    const numberOfPeople = parseInt(messageText);

    if (
      !isNaN(numberOfPeople) &&
      numberOfPeople > 0 &&
      numberOfPeople <= 1000
    ) {
      try {
        console.log("Number of Covered People Validation Result:", {
          input: messageText,
          isValid: true,
          numberOfPeople: numberOfPeople,
        });

        // Calculate total cost
        const coverageCost = userContext.selectedCoverage || 0;
        userContext.totalCost = numberOfPeople * coverageCost;

        userContext.stage = null;
        userContext.numberOfCoveredPeople = numberOfPeople;
        userContexts.set(phone, userContext);

        await selectPaymentPlan(phone, phoneNumberId);
      } catch (error) {
        console.error("Processing error:", error);
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: {
              body: "An error occurred. Please try again.",
            },
          },
          phoneNumberId
        );
      }
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Invalid input. Please enter a number between 1 and 1000. For example: 3",
          },
        },
        phoneNumberId
      );
    }
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

    case "insurance":
      console.log("User requested insurance options.");
      await sendWelcomeMessage(phone, phoneNumberId);
      break;
    case "lifuti":
      console.log("User requested insurance options.");
      await sendLifutiWelcomeMessage(phone, phoneNumberId);
      break;

    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};

const handleTextMessages2 = async (message, phone, phoneNumberId) => {
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

    case "insurance":
      console.log("User requested insurance options.");
      await sendWelcomeMessage(phone, phoneNumberId);
      break;

    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};

const handleInteractiveMessages = async (message, phone, phoneNumberId) => {
  const interactiveType = message.interactive.type;
  const replyId =
    interactiveType === "list_reply"
      ? message.interactive.list_reply.id
      : message.interactive.button_reply.id;

  const userContext = userContexts.get(phone) || {};

  switch (replyId) {
    case "passenger":
      // Send location request message
      const locationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your pick up address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      userContext.serviceType = "passengers";
      userContext.stage = "EXPECTING_PICKUP_ADDRESS";
      userContexts.set(phone, userContext);
      break;

    case "goods":
      // Send location request message
      const locationRequestPayloadGoods = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your pick up address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(
        phone,
        locationRequestPayloadGoods,
        phoneNumberId
      );

      userContext.serviceType = "goods";
      userContext.stage = "EXPECTING_PICKUP_ADDRESS_GOODS";
      userContexts.set(phone, userContext);
      break;

    case "get_insurance":
      await requestInsuranceDocument(phone, phoneNumberId);
      break;

    case "file_claim":
      await initiateClaimProcess(phone, phoneNumberId);
      break;

    case "cat_1":
      userContext.selectedCoverage = 1000000; // Price for CAT 1
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_2":
      userContext.selectedCoverage = 2000000; // Price for CAT 2
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_3":
      userContext.selectedCoverage = 3000000; // Price for CAT 3
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_4":
      userContext.selectedCoverage = 4000000; // Price for CAT 4
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_5":
      userContext.selectedCoverage = 5000000; // Price for CAT 5
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "risk_taker":
      userContext.selectedCoverage = 0; // No cost for no coverage
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "installment_cat1":
      userContext.selectedInstallment = "i_cat1";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat2":
      userContext.selectedInstallment = "i_cat2";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat3":
      userContext.selectedInstallment = "i_cat3";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat4":
      userContext.selectedInstallment = "i_cat4";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "full_payment":
      userContext.selectedInstallment = "i_catf";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    default:
      console.log("Unrecognized reply ID:", replyId);
  }
};

// handle document upload
const handleDocumentUpload = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};

  // Validate phoneNumberId early
  if (!phoneNumberId) {
    console.error("Missing phoneNumberId in handleDocumentUpload");
    return;
  }

  // Only process if expecting a document
  if (userContext.stage !== "EXPECTING_DOCUMENT") {
    console.log("Not expecting a document at this stage");
    return;
  }

  const mediaId = message.document?.id || message.image?.id;
  const mediaMimeType = message.document?.mime_type || message.image?.mime_type;

  // Validate file type
  if (
    !mediaId ||
    !(mediaMimeType === "application/pdf" || mediaMimeType.startsWith("image/"))
  ) {
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "Invalid file type. Please upload a clear image or PDF of your insurance certificate.",
        },
      },
      phoneNumberId
    );
    return;
  }

  try {
    console.log("Received a document:", mediaId);

    // 1. Get the media URL from WhatsApp
    const mediaUrl = await getMediaUrl(mediaId);
    if (!mediaUrl) {
      throw new Error("Failed to get media URL from WhatsApp");
    }

    // 2. Download the media file with proper headers
    const fileBuffer = await axios
      .get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      })
      .then((res) => Buffer.from(res.data, "binary"));

    const fileExtension = getFileExtension(mediaMimeType);
    const fileName = `insurance_documents/${phone}_${Date.now()}${fileExtension}`;

    // 3. Upload the file to Firebase Storage
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      metadata: { contentType: mediaMimeType },
    });

    // 4. Get the public URL of the uploaded file
    const [publicUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-09-2491", // Far future date
    });

    // 5. Save the storage URL to Firestore
    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, "0")}/${(
      today.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${today.getFullYear()}`;

    const insuranceData = {
      userPhone: phone,
      insuranceDocumentUrl: publicUrl, // Store the storage URL
      creationDate: formattedDate,
      plateNumber: "", // Will be filled later
      insuranceStartDate: "", // Will be filled later
      selectedCoverTypes: "",
      numberOfCoveredPeople: 0,
      selectedPersonalAccidentCoverage: 0,
      totalCost: 0,
      selectedInstallment: "",
    };

    // 6. Save to Firestore
    try {
      const docRef = await firestore
        .collection("whatsappInsuranceOrders")
        .add(insuranceData);
      console.log("Document reference saved to Firestore");
      userContext.insuranceDocId = docRef.id;
    } catch (firestoreError) {
      console.error("Firestore save error:", firestoreError);
      throw new Error("Failed to save document reference");
    }

    // 7. Update user context
    userContext.insuranceDocumentId = publicUrl; // Update with storage URL
    userContext.stage = null;
    userContexts.set(phone, userContext);

    let validDocument = false;
    // 8. Make POST request to extract data endpoint
    try {
      const extractionResponse = await axios.post(
        "https://assigurwmessaging-29zi.onrender.com/extract-data",
        {
          imageUrl: publicUrl, // Use the storage URL for extraction
        }
      );
      console.log("Data extraction response:", extractionResponse.data);
      if (extractionResponse.data.success) {
        // Parse the raw response by removing the code block markers and parsing the JSON

        //const rawResponse = extractionResponse.data.data.raw_response;
        //const jsonString = rawResponse.replace(/```json\n|\n```/g, '').trim();
        //const extractedData = JSON.parse(jsonString);

        const rawResponse = extractionResponse.data.data.raw_response;
        console.log("Raw response before parsing:", rawResponse);

        let extractedData;
        try {
          const jsonString = rawResponse.replace(/```json\n|\n```/g, "").trim();
          console.log("Cleaned JSON string:", jsonString);
          extractedData = JSON.parse(jsonString);
        } catch (parseError) {
          console.error("JSON parsing error:", parseError);
          // Send message to user about invalid document
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: "The uploaded document appears to be invalid. Please ensure it's a valid insurance certificate containing policyholder name, chassis number, and insurer details. Please upload a valid document.",
              },
            },
            phoneNumberId
          );
          userContext.stage = "EXPECTING_DOCUMENT";
          userContexts.set(phone, userContext);
          return;
        }

        // Now extractedData is a proper JavaScript object
        const {
          policyholder_name: policyholderName = "",
          policy_no: policyNo = "",
          inception_date: insuranceStartDate = "",
          expiry_date: expiryDate = "",
          mark_and_type: markAndType = "",
          registration_plate_no: plateNumber = "",
          chassis = "",
          licensed_to_carry_no: licensedToCarryNo = "",
          usage = "",
          insurer = "",
        } = extractedData;

        // Check for required fields
        if (
          !policyholderName ||
          policyholderName === "" ||
          !chassis ||
          chassis === "" ||
          !insurer ||
          insurer === ""
        ) {
          // Send error message to user
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: "The uploaded document appears to be invalid. Please ensure it's a valid insurance certificate containing policyholder name, chassis number, and insurer details. Please upload a valid document.",
              },
            },
            phoneNumberId
          );

          // Update context to expect another document
          userContext.stage = "EXPECTING_DOCUMENT";
          userContexts.set(phone, userContext);
          return;
        }

        validDocument = true;

        // Save the extracted data to Firestore
        await firestore
          .collection("whatsappInsuranceOrders")
          .doc(userContext.insuranceDocId)
          .update({
            insuranceStartDate,
            plateNumber,
            policyholderName,
            policyNo,
            expiryDate,
            markAndType,
            chassis,
            licensedToCarryNo,
            usage,
            insurer,
          });

        userContext.formattedPlate = plateNumber; // Update with storage URL
        userContexts.set(phone, userContext);
      } else {
        console.error("Data extraction failed:", extractionResponse.data);
      }
    } catch (extractionError) {
      console.error("Data extraction error:", extractionError);
      // Continue with the flow even if extraction fails
    }

    // 9. Proceed to next step regardless of extraction result
    //await requestVehiclePlateNumber(phone, phoneNumberId);
    //await selectInsurancePeriod(phone, userContext.formattedPlate, phoneNumberId);
    // Only proceed to next step if document is valid
    if (validDocument) {
      await stateInsuranceDuration(
        phone,
        userContext.formattedPlate,
        phoneNumberId
      );
    }
    //await stateInsuranceDuration(phone, userContext.formattedPlate, phoneNumberId);
  } catch (error) {
    console.error("Error processing document:", error);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "An error occurred while processing your document. Please try again.",
        },
      },
      phoneNumberId
    );
  }
};

// Helper function to get media URL from WhatsApp
async function getMediaUrl(mediaId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    return response.data.url;
  } catch (error) {
    console.error("Error getting media URL:", error);
    return null;
  }
}

// Helper function to get file extension from MIME type
function getFileExtension(mimeType) {
  const extensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
  };
  return extensions[mimeType] || "";
}

async function getBase64FromUrl(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(response.data, "binary");
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function extractImageData(imageUrl) {
  try {
    const base64Image = await getBase64FromUrl(imageUrl);

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the following details, policyholder name, policy no, inception date, expiry date, mark & type, registation plate no, chassis, licensed to carry no, usage, insurer. Return these details in JSON format.",
              },
              {
                type: "image_url",
                image_url: {
                  url: base64Image,
                },
              },
            ],
          },
        ],
        max_tokens: 150,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.choices && response.data.choices[0]) {
      const content = response.data.choices[0].message.content;
      // Return the raw response content without parsing
      return {
        raw_response: content,
      };
    }

    throw new Error("No valid response from API");
  } catch (error) {
    console.error(
      "Error during extraction:",
      error.response?.data || error.message
    );
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

app.post("/extract-data", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    const extractedData = await extractImageData(imageUrl);
    console.log("Extracted data:", extractedData);
    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to extract data",
    });
  }
});

const handleLocation = async (location, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};
  try {
    if (userContext.stage === "EXPECTING_PICKUP_ADDRESS") {
      // Retrieve the order from userContext
      const userContext = userContexts.get(phone);

      userContext.pickupLatitude = location.latitude;
      userContext.pickupLongitude = location.longitude;
      userContext.pickupAddress = location.address || "";

      // Send location request message
      const locationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your drop off address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      // Update user context to expect TIN input
      //userContext.vendorNumber = vendorNumber;
      //userContext.currency = currentCurrency;
      userContext.stage = "EXPECTING_DROPOFF_ADDRESS";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_DROPOFF_ADDRESS") {
      // Send location request message

      userContext.dropoffAddress = location.address || "";
      userContext.dropoffLatitude = location.latitude;
      userContext.dropoffLongitude = location.longitude;

      const requestTimePayload = {
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: "When do you want to be picked up?",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "pickup_now",
                  title: "Now",
                },
              },
              // {
              // type: "reply",
              // reply: {
              //   id: "pickup_later",
              //    title: "Later",
              //   },
              //  },
            ],
          },
        },
      };

      await sendWhatsAppMessage(phone, requestTimePayload, phoneNumberId);

      userContext.stage = "EXPECTING_NOW_LATER";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_PICKUP_ADDRESS_GOODS") {
      // Retrieve the order from userContext
      const userContext = userContexts.get(phone);

      userContext.pickupAddress = location.address || "";
      userContext.pickupLatitude = location.latitude;
      userContext.pickupLongitude = location.longitude;

      // Send location request message
      const locationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your drop off address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      userContext.stage = "EXPECTING_DROPOFF_ADDRESS_GOODS";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_DROPOFF_ADDRESS_GOODS") {
      // Send location request message
      const userContext = userContexts.get(phone);

      userContext.dropoffAddress = location.address || "";
      userContext.dropoffLatitude = location.latitude;
      userContext.dropoffLongitude = location.longitude;

      const requestTimePayload = {
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: "When do you want to be picked up?",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "pickup_now",
                  title: "Now",
                },
              },
           //   {
           //     type: "reply",
           //     reply: {
           //       id: "pickup_later",
           //       title: "Later",
           //     },
           //   },
            ],
          },
        },
      };

      await sendWhatsAppMessage(phone, requestTimePayload, phoneNumberId);

      userContext.stage = "EXPECTING_NOW_LATER_GOODS";
      userContexts.set(phone, userContext);
    } else {
      console.log("Not the correct stage");
    }

    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error.message);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: `Sorry, there was an error processing your location: ${error.message}. Please try again.`,
        },
      },
      phoneNumberId
    );
  }
};

// Add this function to handle driver selection
async function handleDriverSelection(message, phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  if (
    userContext.stage === "DISPLAYING_DRIVERS" &&
    message.interactive?.type === "list_reply"
  ) {
    const selectedDriverId = message.interactive.list_reply.id;

    // Find the selected driver from stored context
    const selectedDriver = userContext.availableDrivers.find(
      (driver) => driver.id === selectedDriverId
    );

    if (selectedDriver && userContext.rideRequestId) {
      // Update the ride request with selected driver info
      await firestore
        .collection("whatsappRides")    //whatsappRides requestRiders
        .doc(userContext.rideRequestId)
        .update({
          rider: selectedDriver.driverId,
          offerpool: selectedDriver.id,
          price: selectedDriver.price,
        });

      // Send confirmation message to user
      const confirmationPayload = {
        type: "text",
        text: {
          body: `Your ride has been booked!\n\nDriver Details:\nVehicle: ${selectedDriver.vehicle}\nPlate Number: ${selectedDriver.plateno}\nPrice: ${selectedDriver.price}RWF\n\nYour driver will contact you shortly.`,
        },
      };

      await sendWhatsAppMessage(phone, confirmationPayload, phoneNumberId);

      // Update user context
      userContext.stage = "RIDE_BOOKED";
      userContexts.set(phone, userContext);
    }
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
      if (phoneNumberId === "561637583695258") {
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
    case "text":
      await handleTextMessages(message, phone, phoneNumberId);
      await handlePlateNumberValidation(message, phone, phoneNumberId);
      await handleDateValidation(message, phone, phoneNumberId);
      await handleNumberOfPeople(message, phone, phoneNumberId);
      await handleTimeValidation(message, phone, phoneNumberId);
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

          await sendWhatsAppMessage(
            phone,
            {
              type: "interactive",
              interactive: {
                type: "button",
                body: {
                  text: "Proceed to payment",
                },
                action: {
                  buttons: [
                    {
                      type: "reply",
                      reply: { id: "mtn_momo", title: "MTN MoMo" },
                    },
                    {
                      type: "reply",
                      reply: {
                        id: "airtel_mobile_money",
                        title: "Airtel Money",
                      },
                    },
                  ],
                },
              },
            },
            phoneNumberId
          );

          return; // Exit early after processing TIN
        } else {
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: "Invalid TIN. Please provide a valid TIN.",
              },
            },
            phoneNumberId
          );
          return;
        }
      }
      break;

    case "interactive":
      if (message.interactive.type === "nfm_reply") {
        await handleNFMReply(message, phone, phoneNumberId);
      } else if (message.interactive.type === "button_reply") {
        const buttonId = message.interactive.button_reply.id;

        // Only process if MENU pay
        const userContext = userContexts.get(phone) || {};

        

        await handlePaymentTermsReply(
          buttonId,
          phone,
          userContexts.get(phone),
          phoneNumberId
        );
        console.log("Expecting AGREE & PAY button reply");
        return;
      } else {
        await handleInteractiveMessages(message, phone, phoneNumberId);
        await handleDriverSelection(message, phone, phoneNumberId);
      }
      break;


    case "document":
    case "image":
      await handleDocumentUpload(message, phone, phoneNumberId);
      break;

    case "location":
      await handleLocation(message.location, phone, phoneNumberId);
      break;

    default:
      console.log("Unrecognized message type:", message.type);
  }
}

//if (phoneNumberId === "396791596844039") { 189923527537354
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
      },
    });

    console.log(
      `Message sent successfully from ${phoneNumberId}:`,
      response.data
    );
    return response.data;
  } catch (error) {
    console.error(
      `WhatsApp message sending error from ${phoneNumberId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

// Lifuti
// Initial welcome message
async function sendLifutiWelcomeMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_LIFUTI_WELCOME"; // Stage set to "WELCOME"
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Welcome to Lifuti\nRide Sharing Services!",
      },
      body: {
        text: "What would you like to do today?",
      },
      footer: {
        text: "Select an action to proceed",
      },
      action: {
        button: "View Options",
        sections: [
          {
            title: "Lifuti Services",
            rows: [
              {
                id: "passenger",
                title: "Passenger(Taxi/Cab)",
                description: "Get a ride",
              },
              {
                id: "goods",
                title: "Goods(Transportation)",
                description: "Move goods to the location of your choice",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 5: Custom pickup time selection (for "Later" option)
async function sendCustomPickupTimeMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_CUSTOM_TIME";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: "Please enter your preferred pickup time in either format:\n12:00PM or 13:00",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 5 Goods: Custom pickup time selection (for "Later" option)
async function sendCustomPickupTimeMessageGoods(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_CUSTOM_TIME_GOODS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: "Please enter your preferred pickup time in either format:\n12:00PM or 13:00",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 6: Number of seats selection (for passenger rides)
async function sendSeatSelectionMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_SEATS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "Select Number of Seats",
      },
      body: {
        text: "How many seats would you like to book?",
      },
      footer: {
        text: "Maximum 5 seats per booking",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "seats_1", title: "1 Seat" },
          },
          {
            type: "reply",
            reply: { id: "seats_2", title: "2 Seats" },
          },
          {
            type: "reply",
            reply: { id: "seats_more", title: "More" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Additional seats options (since WhatsApp limits buttons to 3)
async function sendAdditionalSeatsMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_SEATS";
  userContexts.set(phone, userContext);
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "More seats:",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "seats_3", title: "3 Seats" },
          },
          {
            type: "reply",
            reply: { id: "seats_4", title: "4 Seats" },
          },
          {
            type: "reply",
            reply: { id: "seats_5", title: "5 Seats" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 6: Number of quantity selection (for goods rides)
async function sendQuantitySelectionMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_QUANTITY_GOODS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "Select Number of Quantity",
      },
      body: {
        text: "How much would you like to transport?",
      },
      footer: {
        text: "Maximum 100Tons per booking",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "quantity_1", title: "500 Kg" },
          },
          {
            type: "reply",
            reply: { id: "quantity_2", title: "1 Ton" },
          },
          {
            type: "reply",
            reply: { id: "quantity_more", title: "More" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Additional quantity options (limits buttons to 3)
async function sendAdditionalQuantityMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_QUANTITY_GOODS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "More Quantities:",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "quantity_3", title: "2 Tons" },
          },
          {
            type: "reply",
            reply: { id: "quantity_4", title: "3 Tons" },
          },
          {
            type: "reply",
            reply: { id: "quantity_5", title: "4 Tons" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 7: Display available drivers
async function sendAvailableDriversMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "DISPLAYING_DRIVERS";
  userContexts.set(phone, userContext);

  // Prepare data for Firebase
  const rideData = {
    accepted: false,
    cancelled: false,
    completed: false,
    country_code: "RW",
    createdAt: admin.firestore.Timestamp.now(),
    dropoff: false,
    pickup: false,
    paid: false,
    price: 0,
    rejected: false,
    offerpool: "",
    rider: "",
    type: userContext.serviceType || "passengers",
    requestedBy: phone,
    requestedTime: admin.firestore.Timestamp.fromDate(
      userContext.pickupTime ? new Date(userContext.pickupTime) : new Date()
    ),
    pickupLocation: {
      address: userContext.pickupAddress || "",
      latitude: userContext.pickupLatitude || 0,
      longitude: userContext.pickupLongitude || 0,
    },
    dropoffLocation: {
      address: userContext.dropoffAddress || "",
      latitude: userContext.dropoffLatitude || 0,
      longitude: userContext.dropoffLongitude || 0,
    },
    seats:
      userContext.serviceType === "passengers"
        ? parseInt(userContext.seats) || 0
        : null,
    quantity:
      userContext.serviceType === "goods" ? userContext.quantity || null : null,
    measure: null,
  };

  // Save to Firebase
  const docRef = await firestore.collection("whatsappRides").add(rideData);
  console.log("Ride request saved with ID: ", docRef.id);

  // Update user context with Firebase document ID
  userContext.rideRequestId = docRef.id;
  userContexts.set(phone, userContext);

  // Fetch available drivers from offerPool
  let offerPoolQuery = firestore
    .collection("offerPool")
    .where("completed", "==", false)
    .where("type", "==", userContext.serviceType);

  // Add seats filter for passenger service
  if (userContext.serviceType === "passengers" && userContext.seats) {
    offerPoolQuery = offerPoolQuery.where(
      "emptySeat",
      "==",
      parseInt(userContext.seats)
    );
  }

  const offerPoolSnapshot = await offerPoolQuery.get();
  const availableDrivers = [];

  // Process each offer and fetch corresponding vehicle details
  for (const doc of offerPoolSnapshot.docs) {
    const offerData = doc.data();

    // Fetch vehicle details for the driver
    const vehicleDoc = await firestore
      .collection("vehicles")
      .where("userId", "==", offerData.user)
      .get();

    if (!vehicleDoc.empty) {
      const vehicleData = vehicleDoc.docs[0].data();

      // Format datetime
      const formattedDateTimeDriver = formatDateTimeDrivers(offerData.dateTime);

      // Calculate distance
      let distance = "N/A";
      if (
        userContext.pickupLatitude && 
        userContext.pickupLongitude && 
        offerData.pickupLocation?.latitude && 
        offerData.pickupLocation?.longitude
      ) {
        distance = calculateDistance(
          userContext.pickupLatitude, 
          userContext.pickupLongitude,
          offerData.pickupLocation.latitude, 
          offerData.pickupLocation.longitude
        );
      }

      availableDrivers.push({
        id: doc.id,
        plateno: vehicleData.vehicleRegNumber,
        vehicle: vehicleData.vehicleMake,
        seats: offerData.selectedSeat,
        driverId: offerData.user,
        price: offerData.pricePerSeat,
        distance: `${distance} km`,
        dateTime: formattedDateTimeDriver,
      });
    }
  }

  // Store available drivers in user context for later reference
  userContext.availableDrivers = availableDrivers;
  userContexts.set(phone, userContext);

  // Check if no drivers are available
  if (availableDrivers.length === 0) {
    const noDriversPayload = {
      type: "text",
      text: "Oops, no drivers available currently. Your ride has been booked, a driver will call you after accepting the ride.",
    };
    await sendWhatsAppMessage(phone, noDriversPayload, phoneNumberId);
    return;
  }

  // Prepare the WhatsApp message payload
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Available Drivers",
      },
      body: {
        text: `Select a driver to proceed with your ${userContext.serviceType} booking:`,
      },
      footer: {
        text: "Tap to view driver details",
      },
      action: {
        button: "View Drivers",
        sections: [
          {
            title: "Nearby Drivers",
            rows: availableDrivers.map((driver) => ({
              id: driver.id,
              title: `${driver.plateno}`,
              description: `${driver.vehicle} | ${
                userContext.serviceType === "passengers"
                  ? `Seats: ${driver.seats}`
                  : "Goods"
              } | ${driver.price.toLocaleString()} RWF | ${driver.dateTime} | ${driver.distance}`,
            })),
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}


// Helper function to format datetime
function formatDateTimeDrivers(timestamp) {
  if (!timestamp) return "N/A";
  
  // If timestamp is a Firestore Timestamp, convert to Date
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  // Format options
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Kigali', // Adjust to your specific timezone
  };
  
  // Format the date
  return date.toLocaleString('en-US', options);
}

// Haversine formula to calculate distance between two points on Earth
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance.toFixed(2); // Return distance in kilometers with 2 decimal places
}

// Helper function to convert degrees to radians
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Handler for time validation
async function handleTimeValidation(message, phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  if (userContext.stage === "EXPECTING_CUSTOM_TIME") {
    const timeInput = message.text.body.trim();
    const is24HourFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeInput);
    const is12HourFormat = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*[AaPp][Mm]$/.test(
      timeInput
    );

    if (is24HourFormat || is12HourFormat) {
      userContext.pickupTime = timeInput;
      userContext.stage = "EXPECTING_SEATS";
      userContexts.set(phone, userContext);

      // Proceed to seat selection
      await sendSeatSelectionMessage(phone, phoneNumberId);
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Invalid time format. Please enter time as 12:00 PM or 13:00",
          },
        },
        phoneNumberId
      );
    }
  } else if (userContext.stage === "EXPECTING_CUSTOM_TIME_GOODS") {
    const timeInput = message.text.body.trim();
    const is24HourFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeInput);
    const is12HourFormat = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*[AaPp][Mm]$/.test(
      timeInput
    );

    if (is24HourFormat || is12HourFormat) {
      userContext.pickupTime = timeInput;
      userContext.stage = "EXPECTING_QUANTITY_GOODS";
      userContexts.set(phone, userContext);

      // Proceed to quantity selection
      await sendQuantitySelectionMessage(phone, phoneNumberId);
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Invalid time format. Please enter time as 12:00 PM or 13:00",
          },
        },
        phoneNumberId
      );
    }
  }
}

// Insurance services codes + the webhooks above
// Initial welcome message
async function sendWelcomeMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "WELCOME"; // Stage set to "WELCOME"
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Welcome to Ikanisa\nInsurance Services!",
      },
      body: {
        text: "What would you like to do today?",
      },
      footer: {
        text: "Select an action to proceed",
      },
      action: {
        button: "View Options",
        sections: [
          {
            title: "Insurance Services",
            rows: [
              {
                id: "get_insurance",
                title: "Get Insurance",
                description: "Apply for a new insurance policy",
              },
              // {
              //   id: "file_claim",
              //   title: "File Claim",
              //   description: "Submit a new insurance claim",
              // },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Claim Filing Process
async function initiateClaimProcess(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Claim Filing Process",
      },
      body: {
        text: "Gather the following documents for your claim:",
      },
      action: {
        button: "Add Documents",
        sections: [
          {
            title: "Required Documents",
            rows: [
              {
                id: "add_driver_license",
                title: "Driver's License",
                description: "Upload driver license details",
              },
              {
                id: "add_logbook",
                title: "Vehicle Logbook",
                description: "Upload vehicle registration document",
              },
              {
                id: "add_insurance_cert",
                title: "Insurance Certificate",
                description: "Upload current insurance document",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Get insurance document
async function requestInsuranceDocument(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: "Please upload a clear image or PDF of your current or old insurance certificate.",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Update user context to expect a document
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContexts.set(phone, userContext);
}

// Vehicle Information Collection
async function requestVehiclePlateNumber(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: "Please provide your vehicle's number plate (e.g., RAD 123A):",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// State Insurance Duration
async function stateInsuranceDuration(phone, plateNumber, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.plateNumber = plateNumber;
  userContext.stage = "EXPECTING_STATE_INSURANCE_DURATION";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Vehicle Plate Number: ${plateNumber}\n\nHow long do you need your insurance to last?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "full_year",
              title: "Full Year",
            },
          },
          {
            type: "reply",
            reply: {
              id: "less_than_a_year",
              title: "Less Than A Year",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Start  Date
async function startDate(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_START_DATE";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: `Provide inception date.(e.g: DD/MM/YYYY, 02/01/2025)`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function endDate(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_END_DATE";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: `Provide end date.(e.g: DD/MM/YYYY, 04/01/2025)`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Insurance Period Selection
async function selectInsurancePeriod(phone, plateNumber, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.plateNumber = plateNumber;
  userContext.stage = "EXPECTING_INSURANCE_PERIOD";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Vehicle Plate Number: ${plateNumber}\n\nWhen would you like your insurance to start?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "start_today",
              title: "Start Today",
            },
          },
          {
            type: "reply",
            reply: {
              id: "custom_date",
              title: "Choose Custom Date",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Insurance Cover Types
async function selectInsuranceCoverType(phone, phoneNumberId) {
  const payload = {
    //messaging_product: "whatsapp",
    //to: formattedPhone,
    type: "template",
    template: {
      name: "insurancecovermessage", //"welcomeseven",//"welcome_message_icupa", // Replace with your approved template name
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
              payload: "914493983862695", //"3789913271338518" //"598565352606792" // "889862899961785" //"1532505954094165" //"welcomeone"// "d056b889862899961785" //"889862899961785" //  "d056b889862899961785"
            },
          ],
        },
      ],
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function selectToAddPersonalAccidentCover(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Would you like to add Personal Accident Cover?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "add_yes",
              title: "Yes",
            },
          },
          {
            type: "reply",
            reply: {
              id: "add_no",
              title: "No",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "PERSONAL_ACCIDENT_COVER";
  userContexts.set(phone, userContext);
}

// Personal Accident Cover Categories
async function selectPersonalAccidentCategory(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Personal Accident Cover Categories",
      },
      body: {
        text: "Based on coverage levels:",
      },
      action: {
        button: "Select Category",
        sections: [
          {
            title: "Coverage Categories",
            rows: [
              {
                id: "cat_1",
                title: "CAT 1",
                description:
                  "Death/Disability: FRW 1,000,000 | Medical: FRW 100,000",
              },
              {
                id: "cat_2",
                title: "CAT 2",
                description:
                  "Death/Disability: FRW 2,000,000 | Medical: FRW 200,000",
              },
              {
                id: "cat_3",
                title: "CAT 3",
                description:
                  "Death/Disability: FRW 3,000,000 | Medical: FRW 300,000",
              },
              {
                id: "cat_4",
                title: "CAT 4",
                description:
                  "Death/Disability: FRW 4,000,000 | Medical: FRW 400,000",
              },
              {
                id: "cat_5",
                title: "CAT 5",
                description:
                  "Death/Disability: FRW 5,000,000 | Medical: FRW 500,000",
              },
              // Add more categories...
              {
                id: "risk_taker",
                title: "No Cover",
                description: "I'm a risk taker!",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Number of Covered People
async function numberOfCoveredPeople(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  // Set the context to expect number of people
  userContext.stage = "EXPECTING_NUMBER_OF_PEOPLE";
  userContexts.set(phone, userContext);
  const payload = {
    type: "text",
    text: {
      body: "How many people to be covered? (e.g., 1, 4, etc):",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Payment Installment Options - added
async function selectPaymentPlan(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Payment Plans",
      },
      body: {
        text: "Choose how you want to pay for your insurance:",
      },
      action: {
        button: "Select Payment Plan",
        sections: [
          {
            title: "Payment Options",
            rows: [
              {
                id: "installment_cat1",
                title: "CAT 1 Installment",
                description: "1M (25%), 2M (25%), 9M (50%)",
              },
              {
                id: "installment_cat2",
                title: "CAT 2 Installment",
                description: "3M (50%), 9M (50%)",
              },
              {
                id: "installment_cat3",
                title: "CAT 3 Installment",
                description: "6M (75%), 6M (25%)",
              },

              {
                id: "installment_cat4",
                title: "CAT 4 Installment",
                description: "1M (25%) FRW 1.000.000, 3M (35%), 8M (40%)",
              },
              {
                id: "full_payment",
                title: "Full Payment",
                description: "Pay 100% upfront",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function confirmAndPay(phone, selectedInstallmentChoice, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  const totalCost = userContext.totalCost || 0;

  let installmentBreakdown = "";

  switch (selectedInstallmentChoice) {
    case "i_cat1":
      installmentBreakdown = `${totalCost * 0.25}`;
      break;
    case "i_cat2":
      installmentBreakdown = `${totalCost * 0.5}`;
      break;
    case "i_cat3":
      installmentBreakdown = `${totalCost * 0.75}`;
      break;
    case "i_cat4":
      installmentBreakdown = `${totalCost * 0.4}`;
      break;
    case "i_catf":
      installmentBreakdown = `${totalCost}`;
      break;
    default:
      installmentBreakdown = "Unknown installment plan.";
  }

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "Confirm and Pay",
      },
      body: {
        text: "Your selected option includes Admin fees, VAT, and SGF. Do you agree to proceed with the payment?",
      },
      footer: {
        text: `Total: FRW ${installmentBreakdown} for this month`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "agree_to_terms",
              title: "Agree and Pay",
            },
          },
          {
            type: "reply",
            reply: {
              id: "cancel_payment",
              title: "Cancel",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  // Set the context to expect number of people
  userContext.stage = "EXPECTING_CONFIRM_PAY";
  userContexts.set(phone, userContext);
}

// Last message - get insurance
async function processPayment(phone, paymentPlan, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  userContext.userPhone = phone;
  userContexts.set(phone, userContext);

  const totalCost = userContext.totalCost || 0;

  let installmentBreakdown = "";

  switch (paymentPlan) {
    case "i_cat1":
      installmentBreakdown = `1M: FRW ${totalCost * 0.25}`;
      break;
    case "i_cat2":
      installmentBreakdown = `3M: FRW ${totalCost * 0.5}`;
      break;
    case "i_cat3":
      installmentBreakdown = `6M: FRW ${totalCost * 0.75}`;
      break;
    case "i_cat4":
      installmentBreakdown = `8M: FRW ${totalCost * 0.4}`;
      break;
    case "i_catf":
      installmentBreakdown = `Full payment: FRW ${totalCost}`;
      break;
    default:
      installmentBreakdown = "Unknown payment plan.";
  }

  const paymentPayload = {
    type: "text",
    text: {
      body: `Please pay with \nMoMo/Airtel to ${250788767816}\nName: Ikanisa\n_______________________\nYour purchase for ${installmentBreakdown} is being processed after your payment is received, you will receive a confirmation shortly.`,
    },
  };

  console.log("Processing payment for:", phone, paymentPlan);

  // Simulate Payment
  await sendWhatsAppMessage(phone, paymentPayload, phoneNumberId);

  const todayFirebase = new Date();
  const formattedDateFirebase = `${todayFirebase
    .getDate()
    .toString()
    .padStart(2, "0")}/${(todayFirebase.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${todayFirebase.getFullYear()}`;

  const insuranceOrderData = {
    userPhone: userContext.userPhone ? String(userContext.userPhone) : "",
    plateNumber: userContext.plateNumber ? String(userContext.plateNumber) : "",
    insuranceStartDate: userContext.insuranceStartDate
      ? String(userContext.insuranceStartDate)
      : "",
    selectedCoverTypes: userContext.selectedCoverTypes
      ? String(userContext.selectedCoverTypes)
      : "",
    selectedPersonalAccidentCoverage: userContext.selectedCoverage
      ? parseFloat(userContext.selectedCoverage)
      : 0.0,
    totalCost: userContext.totalCost ? parseFloat(userContext.totalCost) : 0.0,
    numberOfCoveredPeople: userContext.numberOfCoveredPeople
      ? parseFloat(userContext.numberOfCoveredPeople)
      : 0.0,
    selectedInstallment: userContext.selectedInstallment
      ? String(userContext.selectedInstallment)
      : "",
    insuranceDocumentUrl: userContext.insuranceDocumentUrl
      ? String(userContext.insuranceDocumentUrl)
      : "",
    extractedData: userContext.extractedData ? userContext.extractedData : {},
    creationDate: formattedDateFirebase,
  };

  try {
    const docRef = await firestore
      .collection("whatsappInsuranceOrders")
      .add(insuranceOrderData);
    console.log(
      "User data successfully saved to Firestore with ID:",
      docRef.id
    );
    console.log(insuranceOrderData);
  } catch (error) {
    console.error("Error saving user data to Firestore:", error.message);
  }

  // Add logic to integrate with payment gateway API if needed.
  console.log("______________________________________");
  console.log("User context after all flows:", userContext);
}

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  testWhatsAppConnection();
});
