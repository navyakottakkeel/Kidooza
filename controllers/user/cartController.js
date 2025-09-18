const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema'); 



const MAX_QTY_PER_PRODUCT = 5;

const addToCart = async (req, res) => {
    try {

        const userId = req.user ? req.user._id : req.session.user;

        if (!userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const { productId, variantId, quantity } = req.body;

        // Fetch product + variant
        const product = await Product.findById(productId).populate('category');
        if (!product) return res.status(404).json({ error: 'Product not found' });

        // ✅ Check if product or category blocked/unlisted
        if (product.isBlock || product.category?.isDeleted) {
            return res.status(400).json({ error: 'Product not available for purchase' });
        }


        let stockAvailable;
        let price;

        if (variantId) {
            const variant = await Variant.findById(variantId);
            if (!variant) return res.status(404).json({ error: 'Variant not found' });
            stockAvailable = variant.stock;
            price = variant.salePrice;
        } else {
            stockAvailable = 0;
            price = product.salePrice;
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
            i => i.productId.equals(productId) && (!variantId || i.variantId?.equals(variantId))
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
                variantId: variantId || null,
                quantity,
                price,
                total: price * quantity
            });
        }
        // ✅ Remove from wishlist if exists
        await Wishlist.updateOne(
            { userId },
            { $pull: { items: { productId } } }
        );


        // ✅ Update total cart price & items
        cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        cart.totalPrice = cart.items.reduce((sum, item) => sum + item.total, 0);

        await cart.save();

        const count = cart.items.length;

        res.json({ message: 'Added to cart', cart, removedFromWishlist: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


///////////////////////////////////////////////////////////////////////////////////////////

const getCartPage = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : req.session.user;

        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        // Populate both Product and Variant details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: "items.productId",
                select: "_id productName description" // only these fields from Product schema
            })
            .populate({
                path: "items.variantId",
                select: "_id productImage basePrice salePrice size stock" // only these fields from Variant schema
            })
            .lean();

            res.locals.user = user;

        if (!cart || cart.items.length === 0) {
            return res.render("cart", {
                cartItems: [],
                totalItemPrice: 0,
                itemDiscount: 0,
                platformFee: 0,
                shippingFee: 0,
                total: 0,
                soldOutItems : 0
            });
        }else{
            cart.items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        }

        let totalItemPrice = 0;
        let itemDiscount = 0;
        let totalItems = 0;
        let soldOutItems = 0; 


        // Map items for rendering
        const cartItems = cart.items.map(item => {
            const basePrice = item.variantId?.basePrice || 0;
            const salePrice = item.variantId?.salePrice || basePrice;
            const stock = item.variantId?.stock ?? 0;
            const isSoldOut = stock <= 0;

          if (isSoldOut) {
            soldOutItems++;
        } else {

            totalItemPrice += basePrice * item.quantity;

            if (basePrice > salePrice) {
                itemDiscount += (basePrice - salePrice) * item.quantity;
            }

            totalItems += item.quantity;
        }


            return {
                productId: item.productId?._id, // ✅ Add product ID
                variantId: item.variantId?._id || null, // ✅ Add variant ID
                quantity: item.quantity,
                name: item.productId?.productName || "",
                description: item.productId?.description || "",
                image: item.variantId?.productImage?.[0] || "/img/1.jpg",
                basePrice,
                salePrice,
                size: item.variantId?.size || "",
                stock,
                isSoldOut            };
        });


        const platformFee = 10;
        let shippingFee = totalItemPrice > 599 ? 0 : 30;
        const total = totalItemPrice - itemDiscount + platformFee + shippingFee;


        res.render("cart", {
            cartItems,
            totalItemPrice,
            itemDiscount,
            platformFee,
            shippingFee,
            total,
            totalItems,
            soldOutItems

        });

    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send("Server Error");
    }
};


///////////////////////////////////////////////////////////////////////////////////////

const updateQuantity = async (req, res) => {
    try {
        const { productId, variantId, quantity } = req.body;
        const userId = req.user ? req.user._id : req.session.user;

        const parsedQty = parseInt(quantity);
        if (parsedQty <= 0) {
            return res.status(400).json({ success: false, message: "Invalid quantity" });
        }

        // 1️⃣ Find variant / product to check stock
        let stockAvailable;
        let price;

        if (variantId && variantId.trim() !== '') {
            const variant = await Variant.findById(variantId);
            if (!variant) {
                return res.status(404).json({ success: false, message: "Variant not found" });
            }
            stockAvailable = variant.stock;
            price = variant.salePrice;
        } else {
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({ success: false, message: "Product not found" });
            }
            stockAvailable = 0; // if no variant, handle accordingly
            price = product.salePrice;
        }

        // 2️⃣ Stock + max qty validation
        if (parsedQty > stockAvailable) {
            return res.status(400).json({ success: false, message: `Only ${stockAvailable} left in stock` });
        }
        if (parsedQty > MAX_QTY_PER_PRODUCT) {
            return res.status(400).json({ success: false, message: `Maximum ${MAX_QTY_PER_PRODUCT} allowed per product` });
        }

        // 3️⃣ Update cart item
        const filter = variantId && variantId.trim() !== ''
            ? { userId, "items.productId": productId, "items.variantId": variantId }
            : { userId, "items.productId": productId, "items.variantId": null };

        await Cart.updateOne(filter, {
            $set: { 
                "items.$.quantity": parsedQty,
                "items.$.total": parsedQty * price
            }
        });

        // 4️⃣ Recalculate cart totals
        const cart = await Cart.findOne({ userId });
        if (cart) {
            cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
            cart.totalPrice = cart.items.reduce((sum, i) => sum + i.total, 0);
            await cart.save();
        }

        res.json({ success: true, message: "Quantity updated", cart });
    } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};



///////////////////////////////////////////////////////////////////////////////////////


const removeFromCart = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : req.session.user;
        let { productId, variantId } = req.params;

        // Convert empty string to null
        variantId = variantId && variantId.trim() !== '' ? variantId : null;

        // Step 1: Remove the item
        await Cart.updateOne(
            { userId },
            { $pull: { items: { productId, variantId } } }
        );

        // Step 2: Recalculate totals
        const cart = await Cart.findOne({ userId });

        if (cart && cart.items.length > 0) {
            let totalItems = 0;

            cart.items.forEach(item => {
                totalItems += item.quantity;
            });

            cart.totalItems = totalItems;
            await cart.save();
        } else {
            // If cart is empty after removal, reset totals
            await Cart.updateOne({ userId }, { $set: { totalItems: 0 } });
        }

        res.redirect("/cart");
    } catch (err) {
        console.error("Error removing from cart:", err);
        res.status(500).send("Server Error");
    }
};


////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    addToCart,
    getCartPage,
    updateQuantity,
    removeFromCart
}