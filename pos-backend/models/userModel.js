const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
    name : {
        type: String,
        required: true,
    },

    email : {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function (v) {
                return /\S+@\S+\.\S+/.test(v);
            },
            message : "Email must be in valid format!"
        }
    },

    // Stored as a string so leading zeros (e.g. 04xx) and "+" country codes are kept
    phone: {
        type : String,
        required: true,
        trim: true,
        validate: {
            validator: function (v) {
                return /^\+?\d{8,15}$/.test(v.replace(/[\s-]/g, ""));
            },
            message : "Phone number must be 8-15 digits!"
        }
    },

    password: {
        type: String,
        required: true,
    },

    role: {
        type: String,
        enum: ["Admin", "Cashier", "Waiter"],
        required: true
    },

    active: {
        type: Boolean,
        default: true
    },

    // Bumped to sign this person out everywhere (password change, deactivation)
    tokenVersion: {
        type: Number,
        default: 0
    }
}, {
    timestamps : true,
    // Never send the password hash back in API responses
    toJSON: {
        transform: (doc, ret) => {
            delete ret.password;
            delete ret.tokenVersion;
            return ret;
        }
    }
})

userSchema.pre('save', async function (next) {
    if(!this.isModified('password')){
        return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
})

module.exports = mongoose.model("User", userSchema);