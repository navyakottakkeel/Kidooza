const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Varient = require('../../models/varientSchema');
const Cart = require('../../models/cartSchema');
//const Wishlist = require('../../models/wishlistSchema'); 



const MAX_QTY_PER_PRODUCT = 5; 

const addToCart = async (req, res) => {
    try {
 
        const userId = req.user ? req.user._id : req.session.user;

        if (!userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const { productId, varientId, quantity } = req.body;

        // Fetch product + variant
        const product = await Product.findById(productId).populate('category');
        if (!product) return res.status(404).json({ error: 'Product not found' });

        // ✅ Check if product or category blocked/unlisted
        if (product.isBlock || product.category?.isDeleted) {
            return res.status(400).json({ error: 'Product not available for purchase' });
        }


         let stockAvailable;
         let price;

        if (varientId) {
            const varient = await Varient.findById(varientId);
            if (!varient) return res.status(404).json({ error: 'Variant not found' });
            stockAvailable = varient.stock;
            price = varient.salePrice;
        }

        // ✅ Out of stock check
        if (stockAvailable <= 0) {
            return res.status(400).json({ error: 'Out of stock' });
        }

        // ✅ Quantity validation
        if (quantity > stockAvailable) {
            return res.status(400).json({ error: `Only ${stockAvailable} left in stock` });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) cart = new Cart({ userId, items: [] });

        const existingItemIndex = cart.items.findIndex(
            i => i.productId.equals(productId) && (!varientId || i.varientId?.equals(varientId))
        );

        if (existingItemIndex > -1) {
            const newQty = cart.items[existingItemIndex].quantity + quantity;
            if (newQty > MAX_QTY_PER_PRODUCT) {
                return res.status(400).json({ error: `The maximum purchase limit for this item is  ${MAX_QTY_PER_PRODUCT} ` });
            }
            if (newQty > stockAvailable) {
                return res.status(400).json({ error: `Only ${stockAvailable} left in stock` });
            }
            cart.items[existingItemIndex].quantity = newQty;
            cart.items[existingItemIndex].total = newQty * price;
        } else {
            if (quantity > MAX_QTY_PER_PRODUCT) {
                return res.status(400).json({ error: `The maximum purchase limit for this item is ${MAX_QTY_PER_PRODUCT} ` });
            }
            cart.items.push({
                productId,
                varientId: varientId || null,
                quantity,
                price,
                total: price * quantity
            });
        }

        // ✅ Remove from wishlist if exists
        // await Wishlist.updateOne(
        //     { userId: req.user._id },
        //     { $pull: { items: { productId } } }
        // );

        // ✅ Update total cart price & items
        cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        cart.totalPrice = cart.items.reduce((sum, item) => sum + item.total, 0);

        await cart.save();

        res.json({ message: 'Added to cart', cart });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};





module.exports = {
    addToCart
}