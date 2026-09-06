const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================
// Gemini Models
// ============================================================

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash"
];

// ============================================================
// Middleware
// ============================================================

app.use(cors());

app.use(
  express.json({
    limit: "12mb"
  })
);

// ============================================================
// Home Route
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Free Stock Metadata API",
    version: "1.0.0",
    message: "API is running successfully."
  });
});

// ============================================================
// Health Check
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy"
  });
});

// ============================================================
// Sleep Helper
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================
// Parse Gemini Response
// ============================================================

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("") || ""
  );
}

// ============================================================
// Clean JSON Response
// ============================================================

function cleanJsonText(text) {
  let cleaned = String(text).trim();

  // Remove markdown code fences if Gemini adds them
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  return cleaned.trim();
}

// ============================================================
// Gemini API Helper
// ============================================================

async function generateWithGemini(parts) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    console.log(`Trying Gemini model: ${model}`);

    // Maximum 2 attempts per model
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(
          `Model: ${model} | Attempt: ${attempt}`
        );

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY
            },

            body: JSON.stringify({
              contents: [
                {
                  parts: parts
                }
              ],

              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          }
        );

        const data = await response.json();

        // ====================================================
        // Successful response
        // ====================================================

        if (response.ok) {
          const text = extractGeminiText(data);

          if (!text) {
            throw new Error(
              "Gemini returned an empty response."
            );
          }

          const cleanedText = cleanJsonText(text);

          try {
            return JSON.parse(cleanedText);
          } catch (jsonError) {
            console.error(
              "Gemini JSON parse error:",
              cleanedText
            );

            throw new Error(
              "Gemini returned invalid JSON."
            );
          }
        }

        // ====================================================
        // Error response
        // ====================================================

        const errorMessage =
          data?.error?.message ||
          `Gemini API returned HTTP ${response.status}`;

        lastError = errorMessage;

        console.error(
          `Gemini error [${model}] [${response.status}]:`,
          errorMessage
        );

        // ====================================================
        // Temporary errors
        // 408 = Request Timeout
        // 429 = Rate Limit
        // 500+ = Server errors
        // ====================================================

        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        if (!retryable) {
          throw new Error(errorMessage);
        }

        // Exponential backoff:
        // Attempt 1 → 2 seconds
        // Attempt 2 → 4 seconds

        const delay =
          Math.pow(2, attempt) * 1000;

        console.log(
          `Retrying in ${delay / 1000} seconds...`
        );

        await sleep(delay);

      } catch (error) {
        lastError = error.message;

        console.error(
          `Gemini request failed [${model}] [attempt ${attempt}]:`,
          error.message
        );

        // Retry network / temporary errors
        if (attempt < 2) {
          const delay =
            Math.pow(2, attempt) * 1000;

          await sleep(delay);
        }
      }
    }

    console.log(
      `Model ${model} unavailable. Moving to fallback model...`
    );
  }

  throw new Error(
    lastError ||
      "All Gemini models are currently unavailable."
  );
}

// ============================================================
// Test Gemini Endpoint
// ============================================================

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
Return JSON only.

{
  "message": "Gemini connection successful."
}
        `
      }
    ]);

    return res.json({
      success: true,
      message:
        result?.message ||
        "Gemini connection successful."
    });

  } catch (error) {
    console.error(
      "Gemini test error:",
      error
    );

    return res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// Generate Stock Metadata
// ============================================================

app.post("/generate-metadata", async (req, res) => {
  try {
    // ========================================================
    // Check API Key
    // ========================================================

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini API key is not configured."
      });
    }

    // ========================================================
    // Get Request Data
    // ========================================================

    const {
      image,
      platform = "General Microstock"
    } = req.body;

    // ========================================================
    // Validate Image
    // ========================================================

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "Image is required."
      });
    }

    if (typeof image !== "string") {
      return res.status(400).json({
        success: false,
        error: "Image must be a base64 data URL."
      });
    }

    // ========================================================
    // Validate Image Type
    // ========================================================

    const match = image.match(
      /^data:(image\/jpeg|image\/png|image\/webp);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        success: false,
        error:
          "Only JPG, PNG and WEBP images are supported."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // ========================================================
    // Approximate Image Size
    // ========================================================

    const imageSize =
      (base64Data.length * 3) / 4;

    const MAX_IMAGE_SIZE =
      7 * 1024 * 1024;

    if (imageSize > MAX_IMAGE_SIZE) {
      return res.status(400).json({
        success: false,
        error: "Image must be smaller than 7 MB."
      });
    }

    // ========================================================
    // Supported Platforms
    // ========================================================

    const supportedPlatforms = [
      "Adobe Stock",
      "Shutterstock",
      "Freepik",
      "iStock",
      "Dreamstime",
      "123RF",
      "Vecteezy",
      "General Microstock"
    ];

    const selectedPlatform =
      supportedPlatforms.includes(platform)
        ? platform
        : "General Microstock";

    // ========================================================
    // AI Prompt
    // ========================================================

    const prompt = `
You are an expert professional microstock metadata specialist.

Analyze the uploaded image carefully and generate high-quality
commercial stock metadata.

TARGET PLATFORM:
${selectedPlatform}

============================================================
TITLE
============================================================

Create one professional stock title.

Requirements:
- Natural English
- Accurate description of the image
- Clear and searchable
- Maximum 200 characters
- Do not use clickbait
- Do not use unnecessary adjectives
- Do not mention "AI generated"
- Do not use trademarks or brand names
- Do not invent facts that are not visible
- Avoid keyword stuffing

============================================================
DESCRIPTION
============================================================

Create one professional stock description.

Requirements:
- Natural English
- Maximum 500 characters
- Describe the main subject
- Describe the visual concept
- Mention relevant environment/background
- Suitable for commercial stock marketplaces
- Do not use promotional language
- Do not mention "AI generated" unless the image itself
  clearly requires an AI-content classification

============================================================
KEYWORDS
============================================================

Generate exactly 40 highly relevant keywords.

Rules:
- Most important keywords first
- Relevant to what is actually visible
- Use single words or short keyword phrases
- No duplicate keywords
- No irrelevant keywords
- No keyword stuffing
- No trademark names
- No celebrity names
- No people's names
- No invented locations
- No misleading concepts
- Use common stock-search terminology
- Include important visual characteristics
- Include subject, texture, color, style and concept when relevant

============================================================
CATEGORY
============================================================

Choose exactly ONE:

Animals
Buildings and Architecture
Business
Drinks
Environment
Food
Graphic Resources
Hobbies and Leisure
Industry
Landscape
Lifestyle
People
Plants and Flowers
Science
Social Issues
Sports
Technology
Transportation
Travel

============================================================
CONTENT TYPE
============================================================

Choose exactly ONE:

Photo
Illustration
3D Render
Vector
Digital Art
AI Generated

============================================================
IMPORTANT
============================================================

Analyze the actual image.

Do not invent objects that are not visible.

Return ONLY valid JSON.

Use exactly this structure:

{
  "title": "",
  "description": "",
  "keywords": [],
  "category": "",
  "contentType": ""
}
`;

    // ========================================================
    // Send Image + Prompt to Gemini
    // ========================================================

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

    // ========================================================
    // Validate Gemini Result
    // ========================================================

    if (!result || typeof result !== "object") {
      throw new Error(
        "Invalid metadata returned by Gemini."
      );
    }

    if (
      !result.title ||
      !result.description ||
      !Array.isArray(result.keywords)
    ) {
      throw new Error(
        "Gemini returned incomplete metadata."
      );
    }

    // ========================================================
    // Clean Keywords
    // ========================================================

    const uniqueKeywords = [
      ...new Set(
        result.keywords
          .map((keyword) =>
            String(keyword)
              .trim()
              .replace(/\s+/g, " ")
          )
          .filter(Boolean)
      )
    ].slice(0, 40);

    // ========================================================
    // Final Response
    // ========================================================

    return res.json({
      success: true,

      platform: selectedPlatform,

      metadata: {
        title: String(result.title).trim(),

        description:
          String(result.description).trim(),

        keywords: uniqueKeywords,

        category:
          String(result.category || "").trim(),

        contentType:
          String(result.contentType || "").trim()
      }
    });

  } catch (error) {
    console.error(
      "Metadata generation error:",
      error
    );

    return res.status(503).json({
      success: false,
      error:
        error.message ||
        "Failed to generate metadata. Please try again."
    });
  }
});

// ============================================================
// 404 Handler
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found."
  });
});

// ============================================================
// Global Error Handler
// ============================================================

app.use((err, req, res, next) => {
  console.error(
    "Global server error:",
    err
  );

  res.status(500).json({
    success: false,
    error: "Internal server error."
  });
});

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Free Stock Metadata API running on port ${PORT}`
  );

  console.log(
    `Gemini models configured: ${GEMINI_MODELS.join(", ")}`
  );
});
