const HTTP_STATUS = require("../constants/httpStatus");

const userErrorHandler = (err, req, res, next) => {
    console.error(err.stack);

    if (res.headersSent) {
        return next(err);
    }

    const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;

    res.status(status).render("page-404", {
      message: err.message || "Something went wrong!",
      status,
      user: req.user || req.session?.user || null
    });

}

const adminErrorHandler = (err, req, res, next) => {
    console.error(err.stack);

    if (res.headersSent) {
        return next(err);
    }

    const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;

    res.status(status).render("admin-error", {
        message: err.message || "Something went wrong!",
        status
      });

} 

module.exports = {
    userErrorHandler,
    adminErrorHandler
}; 