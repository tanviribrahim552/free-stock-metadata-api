const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Render will provide PORT automatically
const PORT = process.env.PORT || 10000;

// ===============================
// Middleware
// ===============================

// Allow requests from frontend
app.use(cors());

// Accept JSON requests
app.use(
  express.json({
    limit: "10mb"
  })
);

// ===============================
// Basic Routes
// ===============================

// Home / API status
app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Free Stock Metadata API",
    message: "API is running successfully."
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy"
  });
});

// ===============================
// Start Server
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Free Stock Metadata API running on port ${PORT}`);
});
