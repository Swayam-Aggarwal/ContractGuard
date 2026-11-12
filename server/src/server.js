import createApp from "./app.js";
import connectDB from "./config/database.js";
import parseEnv from "./config/env.js";
import { recoverInterruptedTestRuns } from "./services/testRun.service.js";

const startServer = async () => {
  try {
    const config = parseEnv();

    await connectDB(config.MONGODB_URI);

    const interruptedCount = await recoverInterruptedTestRuns();

    if (interruptedCount > 0) {
      console.warn(
        `Marked ${interruptedCount} unfinished regression run(s) as INTERRUPTED.`
      );
    }

    const app = createApp(config);

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