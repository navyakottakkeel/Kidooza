const HTTP_STATUS = require("../constants/httpStatus");

const userErrorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV === "development";

  // ✅ Ensure err always exists
  if (!err) {
    err = new Error("Unknown error");
    err.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }

  const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // ✅ Log everything clearly
  console.log("==========================================");
  console.error("🧨 USER ERROR HANDLER TRIGGERED");
  console.error("➡️ URL:", req.originalUrl);
  console.error("➡️ METHOD:", req.method);
  console.error("➡️ USER:", req.user?.email || req.session?.user?.email || "Guest");
  console.error("➡️ STATUS:", status);
  console.error("➡️ MESSAGE:", err.message || "No message provided");
  console.error("➡️ STACK:", err.stack || "No stack trace available");
  console.log("==========================================");

  if (res.headersSent) {
    return next(err);
  }

  // ✅ Provide detailed reason to the page (in dev)
  res.status(status).render("page-404", {
    message: err.message || "Something went wrong!",
    status,
    user: req.user || req.session?.user || null,
    reason: isDev
      ? (err.message ||
        err.toString() ||
        "No specific reason provided (check console logs).")
      : null,
    stack: isDev ? err.stack : null,
  });
};

const adminErrorHandler = (err, req, res, next) => {
  console.error("🧨 ADMIN ERROR HANDLER TRIGGERED 🧨");
  console.error("URL:", req.originalUrl);
  console.error("Method:", req.method);
  console.error("Admin:", req.user?.email || "Unknown");
  console.error("Status:", err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR);
  console.error("Message:", err.message);
  console.error("Stack Trace:\n", err.stack);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  res.status(status).render("admin-error", {
    message: err.message || "Something went wrong!",
    status,
  });
};

module.exports = {
  userErrorHandler,
  adminErrorHandler,
};
