const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;
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
    status: "healthy"
  });
});

// ===============================
// Gemini Helper
// ===============================

async function generateWithGemini(parts) {
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
            parts
          }
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API Error:", data);

    throw new Error(
      data?.error?.message || "Gemini API request failed."
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text);
}

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

    const result = await generateWithGemini([
      {
        text: `
Reply with JSON only.

{
  "message": "Gemini connection successful."
}
        `
      }
    ]);

    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===============================
// Generate Stock Metadata
// ===============================

app.post("/generate-metadata", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini API key is not configured."
      });
    }

    const { image, platform = "General Microstock" } = req.body;

    // Validate image
    if (!image) {
      return res.status(400).json({
        success: false,
        error: "Image is required."
      });
    }

    // Validate data URL
    const match = image.match(
      /^data:(image\/jpeg|image\/png|image\/webp);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        success: false,
        error: "Only JPG, PNG and WEBP images are supported."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // Approximate decoded image size
    const imageSize =
      (base64Data.length * 3) / 4;

    if (imageSize > 7 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: "Image must be smaller than 7 MB."
      });
    }

    // ===============================
    // AI Prompt
    // ===============================

    const prompt = `
You are an expert microstock metadata specialist.

Analyze the uploaded image carefully.

Create professional metadata suitable for stock marketplaces.

Target platform:
${platform}

Requirements:

1. Title:
- Clear and descriptive
- Natural English
- Maximum 200 characters
- Do not use unnecessary promotional words
- Do not mention "AI generated"

2. Description:
- Professional stock-photo description
- Explain the main subject, environment, concept and visual context
- Natural English
- Maximum 500 characters

3. Keywords:
- Generate 40 highly relevant keywords
- Single words or short phrases
- Most important keywords first
- Do not repeat keywords
- No irrelevant keywords
- No trademarked brand names
- No people's names unless clearly necessary
- Use natural stock-search terminology

4. Category:
Choose the most appropriate category.

Possible categories:
- Animals
- Buildings and Architecture
- Business
- Drinks
- Environment
- Food
- Graphic Resources
- Hobbies and Leisure
- Industry
- Landscape
- Lifestyle
- People
- Plants and Flowers
- Science
- Social Issues
- Sports
- Technology
- Transportation
- Travel

5. Content type:
Choose one:
- Photo
- Illustration
- 3D Render
- Vector
- Digital Art
- AI Generated

Return JSON only using exactly this structure:

{
  "title": "",
  "description": "",
  "keywords": [],
  "category": "",
  "contentType": ""
}
`;

    const result = await generateWithGemini([
      {
        text: prompt
      },
      {
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      }
    ]);

    // ===============================
    // Validate Result
    // ===============================

    if (
      !result.title ||
      !result.description ||
      !Array.isArray(result.keywords)
    ) {
      throw new Error(
        "Invalid metadata returned by Gemini."
      );
    }

    // Remove duplicate keywords
    const uniqueKeywords = [
      ...new Set(
        result.keywords
          .map(keyword =>
            String(keyword).trim()
          )
          .filter(Boolean)
      )
    ].slice(0, 50);

    // ===============================
    // Final Response
    // ===============================

    res.json({
      success: true,
      platform,
      metadata: {
        title: result.title,
        description: result.description,
        keywords: uniqueKeywords,
        category: result.category || "",
        contentType: result.contentType || ""
      }
    });

  } catch (error) {
    console.error(
      "Metadata generation error:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to generate metadata."
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
