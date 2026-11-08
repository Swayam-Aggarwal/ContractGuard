
import createApp from "./app.js";
import connectDB from "./config/database.js";
import parseEnv from "./config/env.js";

const startServer = async () => {
  try {
    // Validate environment variables
    const config = parseEnv();

    // Connect to MongoDB
    await connectDB(config.MONGODB_URI);

    // Create the Express application
    const app = createApp(config);

    // Start Express
    const server = app.listen(config.PORT, () => {
      console.log(
        `ContractGuard API running at http://localhost:${config.PORT}`
      );
    });

    server.on("error", (error) => {
      console.error("Server startup failed:", error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
};

startServer();
