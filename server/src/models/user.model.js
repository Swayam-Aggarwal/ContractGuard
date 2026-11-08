
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
      match: [
        /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/,
        "Password hash must be a valid bcrypt hash",
      ],
    },

    displayName: {
      type: String,
      trim: true,
      maxlength: 80,
    },
  },
  {
    timestamps: true,
    collection: "users",

    // Automatically create indexes in development,
    // but manage them deliberately in production.
    autoIndex: process.env.NODE_ENV !== "production",

    // Never include the password hash in serialized documents.
    toJSON: {
      transform: (_document, result) => {
        delete result.passwordHash;
        return result;
      },
    },

    toObject: {
      transform: (_document, result) => {
        delete result.passwordHash;
        return result;
      },
    },
  }
);

// Every user must have a unique email address.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    name: "uniq_users_email",
  }
);

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

export default User;
