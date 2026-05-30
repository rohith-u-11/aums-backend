const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const Credential = require("./models/Credential");

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn("MONGODB_URI is missing in .env");
} else {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err.message));
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "running",
    dbConnected: mongoose.connection.readyState === 1,
  });
});

// Root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
  });
});

/*
  SAFE AUTH FLOW:
  - /api/register: creates a user with hashed password
  - /api/login: verifies password against hash
  - /api/admin/credentials: returns only usernames and timestamps
*/

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const existingUser = await Credential.findOne({ username });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new Credential({
      username,
      passwordHash,
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const user = await Credential.findOne({ username });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get all users for admin dashboard
app.get("/api/admin/credentials", async (req, res) => {
  try {
    const records = await Credential.find({})
      .select("username createdAt updatedAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (err) {
    console.error("Fetch error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve records",
    });
  }
});

// Delete one user
app.delete("/api/admin/credentials/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Credential.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Record deleted successfully",
    });
  } catch (err) {
    console.error("Delete error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete record",
    });
  }
});

// Clear all users
app.delete("/api/admin/credentials", async (req, res) => {
  try {
    const result = await Credential.deleteMany({});

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} records`,
    });
  } catch (err) {
    console.error("Clear error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to clear records",
    });
  }
});

// Vercel export
module.exports = app;

// Local development only
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
