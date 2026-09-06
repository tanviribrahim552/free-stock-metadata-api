const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;

// Gemini configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-flash-latest";

// ===============================
// Middleware
// ===============================

app.use(cors());

app.use(
  express.json({
    limit: "10mb"
  })
);

// ===============================
// Home
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Free Stock Metadata API",
    message: "API is running successfully."
  });
});

// ===============================
// Health Check
// ===============================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    geminiConfigured: Boolean(GEMINI_API_KEY)
  });
});

// ===============================
// Test Gemini
// ===============================

app.post("/test-gemini", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini API key is not configured."
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Reply with exactly: Gemini connection successful."
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);

      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({
      success: true,
      message: text
    });

  } catch (error) {
    console.error("Server Error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to connect to Gemini."
    });
  }
});

// ===============================
// Start Server
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Free Stock Metadata API running on port ${PORT}`
  );
});
