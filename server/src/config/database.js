
import mongoose from "mongoose";

const connectDB = async (mongoUri) => {
  try {
    const connection = await mongoose.connect(mongoUri, {
      dbName: "contractguard",
    });

    console.log(
      `MongoDB connected: ${connection.connection.host}`
    );
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export default connectDB;
