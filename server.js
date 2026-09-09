// ============================================================
// Free Stock Metadata API
// Production-Ready Version
// ============================================================

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// ============================================================
// Configuration
// ============================================================

const PORT = process.env.PORT || 10000;

// AI Provider
// Current supported provider: gemini
// Future: openai, claude, etc.
const AI_PROVIDER = (
  process.env.AI_PROVIDER || "gemini"
).toLowerCase();

// API Keys
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
// Express Middleware
// ============================================================

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(
  express.json({
    limit: "12mb"
  })
);

// ============================================================
// Simple In-Memory Rate Limiter
// No extra npm package required
// ============================================================

const rateLimitStore = new Map();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests / IP / 15 minutes

function rateLimit(req, res, next) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();

  const record = rateLimitStore.get(ip);

  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(ip, {
      start: now,
      count: 1
    });

    return next();
  }

  record.count++;

  if (record.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      error: "Too many requests. Please try again later."
    });
  }

  next();
}

app.use("/generate-metadata", rateLimit);

// ============================================================
// Home Route
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Free Stock Metadata API",
    version: "2.0.0",
    provider: AI_PROVIDER,
    message: "API is running successfully."
  });
});

// ============================================================
// Health Check
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    provider: AI_PROVIDER
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
// Safe Number Helper
// ============================================================

function safeNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    Math.max(Math.round(number), min),
    max
  );
}

// ============================================================
// Word Count Helper
// ============================================================

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

// ============================================================
// Clean Text
// ============================================================

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// Clean JSON Response
// ============================================================

function cleanJsonText(text) {
  let cleaned = String(text || "").trim();

  // Remove markdown JSON fences
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  // Try to isolate JSON object
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return cleaned.trim();
}

// ============================================================
// Extract Gemini Text
// ============================================================

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("") || ""
  );
}

// ============================================================
// Remove Duplicate Keywords
// Case-insensitive
// ============================================================

function removeDuplicateKeywords(keywords) {
  const seen = new Set();
  const output = [];

  for (const keyword of keywords || []) {
    const cleaned = cleanText(keyword);

    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      output.push(cleaned);
    }
  }

  return output;
}

// ============================================================
// Keyword Style Helper
// ============================================================

function getKeywordStyleInstruction(
  keywordStyle,
  singleWordOnly
) {
  if (singleWordOnly === true) {
    return `
KEYWORD STYLE:
- Use single-word keywords only.
- Do NOT use multi-word phrases.
`;
  }

  switch (keywordStyle) {
    case "Mostly Single-word":
      return `
KEYWORD STYLE:
- Prefer mostly single-word keywords.
- Use only a smaller number of highly relevant short phrases.
`;

    case "Mostly Multi-word":
      return `
KEYWORD STYLE:
- Prefer relevant multi-word stock-search phrases.
- Include some useful single-word keywords where appropriate.
`;

    case "Single-word Only":
      return `
KEYWORD STYLE:
- Use single-word keywords only.
- Every keyword must contain exactly one word.
`;

    case "Balanced":
    default:
      return `
KEYWORD STYLE:
- Use a balanced mixture of single words and short phrases.
- Prefer single-word keywords when they are more useful.
- Use multi-word phrases only when they add meaningful search intent.
`;
  }
}

// ============================================================
// Background Type Instruction
// ============================================================

function getBackgroundInstruction(backgroundType) {
  switch (backgroundType) {
    case "Transparent / Isolated":
      return `
BACKGROUND TYPE:
- Treat the subject as an isolated/transparent-background concept.
- Prioritize relevant isolated-object, cutout, copy-space and object-focused terminology ONLY when visually appropriate.
- Do not invent transparency if the image visibly has a normal background.
`;

    case "Normal Background":
      return `
BACKGROUND TYPE:
- Treat the image as a normal-background composition.
- Describe the visible environment/background accurately.
`;

    case "Auto Detect":
    default:
      return `
BACKGROUND TYPE:
- Automatically analyze the image background.
- Determine whether the subject is isolated or presented in a normal environment.
- Never invent transparency or isolation.
`;
  }
}

// ============================================================
// Preset Instruction
// ============================================================

function getPresetInstruction(preset) {
  switch (preset) {
    case "Adobe Stock":
      return `
PRESET:
Optimize the metadata for Adobe Stock style search behavior.
Prioritize accurate, natural and commercially useful keywords.
`;

    case "Shutterstock":
      return `
PRESET:
Optimize the metadata for Shutterstock-style stock search.
Prioritize descriptive and commercially useful terminology.
`;

    case "SEO Focused":
      return `
PRESET:
Prioritize strong search intent and highly discoverable terminology.
Keep all keywords visually accurate.
`;

    case "Short Metadata":
      return `
PRESET:
Prefer concise titles and descriptions.
Avoid unnecessary wording.
`;

    case "Detailed Metadata":
      return `
PRESET:
Create more descriptive metadata while remaining natural and commercially useful.
`;

    case "Custom":
      return `
PRESET:
Follow the user's custom metadata settings exactly.
`;

    case "Recommended":
    default:
      return `
PRESET:
Use balanced professional stock metadata settings.
Accuracy and relevance are more important than keyword quantity.
`;
  }
}

// ============================================================
// Gemini API
// ============================================================

async function generateWithGemini(parts) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Gemini API key is not configured."
    );
  }

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    console.log(
      `Trying Gemini model: ${model}`
    );

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
                  parts
                }
              ],

              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.35
              }
            })
          }
        );

        const data = await response.json();

        // ------------------------------------------------------
        // Success
        // ------------------------------------------------------

        if (response.ok) {
          const text = extractGeminiText(data);

          if (!text) {
            throw new Error(
              "Gemini returned an empty response."
            );
          }

          const cleanedText =
            cleanJsonText(text);

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

        // ------------------------------------------------------
        // Error
        // ------------------------------------------------------

        const errorMessage =
          data?.error?.message ||
          `Gemini API returned HTTP ${response.status}`;

        lastError = errorMessage;

        console.error(
          `Gemini error [${model}] [${response.status}]:`,
          errorMessage
        );

        // Retryable status codes
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        if (!retryable) {
          throw new Error(errorMessage);
        }

        // Exponential backoff
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
// AI Provider Layer
//
// IMPORTANT:
// Blogger does NOT communicate directly with Gemini/OpenAI/etc.
// It always communicates with this backend.
// ============================================================

async function callAIProvider(parts) {
  switch (AI_PROVIDER) {
    case "gemini":
      return await generateWithGemini(parts);

    // Future providers can be added here.
    //
    // case "openai":
    //   return await generateWithOpenAI(parts);
    //
    // case "claude":
    //   return await generateWithClaude(parts);

    default:
      throw new Error(
        `Unsupported AI provider: ${AI_PROVIDER}`
      );
  }
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

    const result = await callAIProvider([
      {
        text: `
Return JSON only.

{
  "message": "AI connection successful."
}
`
      }
    ]);

    return res.json({
      success: true,
      provider: AI_PROVIDER,
      message:
        result?.message ||
        "AI connection successful."
    });

  } catch (error) {
    console.error(
      "AI test error:",
      error
    );

    return res.status(503).json({
      success: false,
      error:
        error.message ||
        "AI connection failed."
    });
  }
});

// ============================================================
// Generate Stock Metadata
// ============================================================

app.post(
  "/generate-metadata",
  async (req, res) => {
    try {

      // ========================================================
      // API Configuration Check
      // ========================================================

      if (
        AI_PROVIDER === "gemini" &&
        !GEMINI_API_KEY
      ) {
        return res.status(500).json({
          success: false,
          error:
            "Gemini API key is not configured."
        });
      }

      // ========================================================
      // Get Request Data
      // ========================================================

      const {
        image,
        platform = "General Microstock",

        minTitleWords = 5,
        maxTitleWords = 15,

        minDescriptionWords = 20,
        maxDescriptionWords = 45,

        minKeywords = 25,
        maxKeywords = 40,

        keywordStyle = "Balanced",
        singleWordOnly = false,

        backgroundType = "Auto Detect",

        preset = "Recommended"

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
          error:
            "Image must be a base64 data URL."
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
      // Image Size
      // ========================================================

      const imageSize =
        (base64Data.length * 3) / 4;

      const MAX_IMAGE_SIZE =
        7 * 1024 * 1024;

      if (imageSize > MAX_IMAGE_SIZE) {
        return res.status(400).json({
          success: false,
          error:
            "Image must be smaller than 7 MB."
        });
      }

      // ========================================================
      // Normalize User Settings
      // ========================================================

      let titleMin = safeNumber(
        minTitleWords,
        5,
        2,
        30
      );

      let titleMax = safeNumber(
        maxTitleWords,
        15,
        2,
        40
      );

      let descriptionMin = safeNumber(
        minDescriptionWords,
        20,
        5,
        100
      );

      let descriptionMax = safeNumber(
        maxDescriptionWords,
        45,
        5,
        150
      );

      let keywordsMin = safeNumber(
        minKeywords,
        25,
        5,
        50
      );

      let keywordsMax = safeNumber(
        maxKeywords,
        40,
        5,
        50
      );

      // Fix reversed ranges
      if (titleMin > titleMax) {
        [titleMin, titleMax] =
          [titleMax, titleMin];
      }

      if (descriptionMin > descriptionMax) {
        [descriptionMin, descriptionMax] =
          [descriptionMax, descriptionMin];
      }

      if (keywordsMin > keywordsMax) {
        [keywordsMin, keywordsMax] =
          [keywordsMax, keywordsMin];
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
      // Supported Keyword Styles
      // ========================================================

      const supportedKeywordStyles = [
        "Balanced",
        "Mostly Single-word",
        "Mostly Multi-word",
        "Single-word Only"
      ];

      const selectedKeywordStyle =
        supportedKeywordStyles.includes(
          keywordStyle
        )
          ? keywordStyle
          : "Balanced";

      // ========================================================
      // Supported Background Types
      // ========================================================

      const supportedBackgroundTypes = [
        "Auto Detect",
        "Transparent / Isolated",
        "Normal Background"
      ];

      const selectedBackgroundType =
        supportedBackgroundTypes.includes(
          backgroundType
        )
          ? backgroundType
          : "Auto Detect";

      // ========================================================
      // Supported Presets
      // ========================================================

      const supportedPresets = [
        "Recommended",
        "Adobe Stock",
        "Shutterstock",
        "SEO Focused",
        "Short Metadata",
        "Detailed Metadata",
        "Custom"
      ];

      const selectedPreset =
        supportedPresets.includes(preset)
          ? preset
          : "Recommended";

      // ========================================================
      // Build Dynamic Instructions
      // ========================================================

      const keywordStyleInstruction =
        getKeywordStyleInstruction(
          selectedKeywordStyle,
          Boolean(singleWordOnly)
        );

      const backgroundInstruction =
        getBackgroundInstruction(
          selectedBackgroundType
        );

      const presetInstruction =
        getPresetInstruction(
          selectedPreset
        );

      // ========================================================
      // AI Prompt
      // ========================================================

      const prompt = `
You are an expert professional microstock metadata specialist.

Analyze the uploaded image carefully and generate accurate,
commercially useful stock metadata.

============================================================
TARGET PLATFORM
============================================================

${selectedPlatform}

============================================================
PRESET
============================================================

${presetInstruction}

============================================================
TITLE
============================================================

Create ONE professional stock title.

Requirements:

- Natural English.
- Accurate to the visible image.
- Searchable.
- Commercially useful.
- Minimum ${titleMin} words.
- Maximum ${titleMax} words.
- Maximum 200 characters.
- No clickbait.
- No unnecessary adjectives.
- No keyword stuffing.
- No trademark names.
- No celebrity names.
- No invented facts.
- Do not mention AI generated unless required by the image classification.

============================================================
DESCRIPTION
============================================================

Create ONE professional stock description.

Requirements:

- Natural English.
- Minimum ${descriptionMin} words.
- Maximum ${descriptionMax} words.
- Maximum 500 characters.
- Describe the main subject.
- Describe the visual concept.
- Describe relevant environment/background.
- Commercial stock marketplace appropriate.
- No promotional language.
- No keyword stuffing.
- No invented facts.

============================================================
KEYWORDS
============================================================

Generate between ${keywordsMin} and ${keywordsMax} keywords.

${keywordStyleInstruction}

Rules:

- Most important keywords first.
- Only use keywords relevant to the actual image.
- No duplicate keywords.
- No irrelevant keywords.
- No keyword stuffing.
- No trademarks.
- No celebrity names.
- No people's names.
- No invented locations.
- No misleading concepts.
- Use common stock-search terminology.
- Include important visible characteristics.
- Include subject, environment, texture, color, style,
  composition and concept when actually relevant.

============================================================
BACKGROUND
============================================================

${backgroundInstruction}

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

Do NOT invent objects, people, locations, concepts,
backgrounds or characteristics that are not visible.

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
      // Send Prompt + Image to AI
      // ========================================================

      const result = await callAIProvider([
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
      // Validate AI Result
      // ========================================================

      if (
        !result ||
        typeof result !== "object"
      ) {
        throw new Error(
          "Invalid metadata returned by AI."
        );
      }

      if (
        !result.title ||
        !result.description ||
        !Array.isArray(result.keywords)
      ) {
        throw new Error(
          "AI returned incomplete metadata."
        );
      }

      // ========================================================
      // Clean Title
      // ========================================================

      const title =
        cleanText(result.title)
          .slice(0, 200);

      // ========================================================
      // Clean Description
      // ========================================================

      const description =
        cleanText(result.description)
          .slice(0, 500);

      // ========================================================
      // Clean Keywords
      // ========================================================

      let keywords =
        removeDuplicateKeywords(
          result.keywords
        );

      // Single-word-only enforcement
      if (Boolean(singleWordOnly)) {
        keywords = keywords.filter(
          (keyword) =>
            !/\s/.test(keyword)
        );
      }

      // Limit to requested maximum
      keywords =
        keywords.slice(0, keywordsMax);

      // ========================================================
      // Ensure Minimum Keyword Count
      // ========================================================

      if (keywords.length < keywordsMin) {
        console.warn(
          `AI returned ${keywords.length} keywords. ` +
          `Requested minimum: ${keywordsMin}.`
        );
      }

      // ========================================================
      // Validate Category
      // ========================================================

      const categories = [
        "Animals",
        "Buildings and Architecture",
        "Business",
        "Drinks",
        "Environment",
        "Food",
        "Graphic Resources",
        "Hobbies and Leisure",
        "Industry",
        "Landscape",
        "Lifestyle",
        "People",
        "Plants and Flowers",
        "Science",
        "Social Issues",
        "Sports",
        "Technology",
        "Transportation",
        "Travel"
      ];

      const category =
        categories.includes(
          String(result.category || "").trim()
        )
          ? String(result.category).trim()
          : "Graphic Resources";

      // ========================================================
      // Validate Content Type
      // ========================================================

      const contentTypes = [
        "Photo",
        "Illustration",
        "3D Render",
        "Vector",
        "Digital Art",
        "AI Generated"
      ];

      const contentType =
        contentTypes.includes(
          String(result.contentType || "").trim()
        )
          ? String(result.contentType).trim()
          : "Digital Art";

      // ========================================================
      // Final Response
      //
      // IMPORTANT:
      // Keep this structure stable so Blogger does not need
      // to change when the AI provider changes.
      // ========================================================

      return res.json({
        success: true,

        provider: AI_PROVIDER,

        platform: selectedPlatform,

        settings: {
          minTitleWords: titleMin,
          maxTitleWords: titleMax,

          minDescriptionWords:
            descriptionMin,

          maxDescriptionWords:
            descriptionMax,

          minKeywords: keywordsMin,
          maxKeywords: keywordsMax,

          keywordStyle:
            selectedKeywordStyle,

          singleWordOnly:
            Boolean(singleWordOnly),

          backgroundType:
            selectedBackgroundType,

          preset: selectedPreset
        },

        metadata: {
          title,

          description,

          keywords,

          category,

          contentType
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
  }
);

// ============================================================
// Future Tool: Image to Prompt
//
// Endpoint reserved for future implementation.
// Blogger can later call:
//
// POST /image-to-prompt
//
// without changing the overall API architecture.
// ============================================================

app.post(
  "/image-to-prompt",
  rateLimit,
  async (req, res) => {
    return res.status(501).json({
      success: false,
      error:
        "Image to Prompt is not implemented yet."
    });
  }
);

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

app.use(
  (err, req, res, next) => {
    console.error(
      "Global server error:",
      err
    );

    res.status(500).json({
      success: false,
      error: "Internal server error."
    });
  }
);

// ============================================================
// Start Server
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Free Stock Metadata API running on port ${PORT}`
    );

    console.log(
      `AI Provider: ${AI_PROVIDER}`
    );

    console.log(
      `Gemini models configured: ${GEMINI_MODELS.join(
        ", "
      )}`
    );
  }
);
