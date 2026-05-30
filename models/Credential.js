const mongoose = require('mongoose');

// Schema representing the login details submitted by users
const CredentialSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Compile and export the model
module.exports = mongoose.model('Credential', CredentialSchema);
