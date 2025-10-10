const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const variantController = require('../controllers/admin/variantController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const offerController = require('../controllers/admin/offerController');
const salesReportController = require("../controllers/admin/salesReportController");
const dashboardController = require('../controllers/admin/dashboardController');


const {adminAuth } = require('../middlewares/auth');
const upload = require('../middlewares/multer');
const { adminErrorHandler } = require("../middlewares/errorHandler");
const Category = require('../models/categorySchema');


router.get('/pageerror', adminController.pageerror);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

router.use(adminAuth)
router.get('/users', customerController.customerInfo);
router.get('/dashboard', adminController.loadDashboard);
router.get('/blockCustomer', customerController.customerBlocked);
router.get('/unblockCustomer', customerController.customerUnblocked);

 router.route('/category')
.get(categoryController.categoryInfo)
.post(categoryController.addCategory)
.put(categoryController.editCategory)

// router.get('/category', categoryController.categoryInfo);
// router.post('/category/add', categoryController.addCategory);
// router.post('/category/edit', categoryController.editCategory);

 router.get('/category/delete', categoryController.softDeleteCategory);

router.get('/products',productController.loadProducts);
router.get('/products/add', productController.loadAddProduct);
router.post('/products/add', upload.array('productImage', 5), productController.addProduct);
router.patch('/products/:id/block', productController.toggleBlockProduct);

router.get('/products/edit',productController.loadEditProduct);
router.post('/products/edit',productController.editProduct)
router.post('/products/delete-image', productController.deleteProductImage);
router.post('/products/update-image', upload.single('image'), productController.updateProductImage);
router.post('/products/add-image', upload.single('image'), productController.addProductImage);


router.route('/variants')
.get(variantController.loadVariant)
// .post(upload.array('productImage', 5),variantController.addVariant)
.put(variantController.updateVariant)

router.delete('/variants/:id',variantController.deleteVariant);
router.post('/variants', upload.array('productImage', 5), variantController.addVariant);

router.get("/orders", orderController.listOrders);
router.get("/orders/:orderId", orderController.getOrderDetail);
router.post("/orders/:orderId/status", orderController.updateOrderStatus);
router.post("/orders/:orderId/items/:itemId/status", orderController.updateItemStatus);
router.post("/orders/:orderId/returns/:itemId/verify", orderController.verifyReturn);

router.get("/coupons", couponController.getCoupons);
router.post("/coupons/create", couponController.createCoupon);
router.delete("/coupons/:id", couponController.deleteCoupon);


// Offer Management
router.get("/offers", offerController.getOffersPage);
router.post("/offers/create", offerController.createOffer);
router.put("/offers/:id", offerController.updateOffer);
router.delete("/offers/:id", offerController.deleteOffer);
router.patch("/offers/:id/status", offerController.toggleOfferStatus);


router.get("/sales-report", salesReportController.getSalesReportPage);
router.get("/sales-report/filter", salesReportController.filterSalesReport);
router.get("/sales-report/download/:type", salesReportController.downloadSalesReport);

router.get('/dashboard', dashboardController.loadDashboard);


router.use(adminErrorHandler);

module.exports = router;