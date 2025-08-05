const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const { userAuth, adminAuth } = require('../middlewares/auth');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const varientController = require('../controllers/admin/varientController');

const upload = require('../middlewares/multer');
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
router.put('/products/update', upload.array('updatedImages'), productController.updateProduct);
router.post('/products/add', upload.array('productImage', 5), productController.addProduct);
router.patch('/products/delete/:id', productController.softDeleteProduct);


router.route('/varients')
.get(varientController.loadVarient)
.post(varientController.addVarient)
.put(varientController.updateVarient)


router.delete('/varients/:id',varientController.deleteVarient);





module.exports = router;