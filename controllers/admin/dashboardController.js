const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');


// Helper function for date range filter
function getDateFilter(type) {
  const now = new Date();
  let startDate;

  switch (type) {
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'weekly':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    default:
      startDate = new Date(0); // all data
  }

  return { createdAt: { $gte: startDate, $lte: new Date() } };
}

const loadDashboard = async (req, res) => {
  try {
    const filter = req.query.filter || 'yearly'; // default yearly
    const dateFilter = getDateFilter(filter);

    // ------------------ SALES CHART ------------------
    const salesData = await Order.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'Paid' } },
      {
        $group: {
          _id: { $month: '$createdAt' },
          totalSales: { $sum: '$totalPrice' },
        },
      },
      { $sort: { '_id': 1 } }
    ]);

    const labels = salesData.map(d => `Month ${d._id}`);
    const totals = salesData.map(d => d.totalSales);

    // ------------------ TOP PRODUCTS ------------------
    const topProducts = await Order.aggregate([
      { $unwind: '$orderedItems' },
      {
        $group: {
          _id: '$orderedItems.product',
          totalQuantity: { $sum: '$orderedItems.quantity' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.productName',
          totalQuantity: 1
        }
      }
    ]);

    // ------------------ TOP CATEGORIES ------------------
    const topCategories = await Order.aggregate([
      { $unwind: '$orderedItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.category',
          totalSold: { $sum: '$orderedItems.quantity' }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $project: {
          name: '$category.name',
          totalSold: 1
        }
      }
    ]);

    // ------------------ TOP BRANDS ------------------
    const topBrands = await Order.aggregate([
      { $unwind: '$orderedItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.brand',
          totalSold: { $sum: '$orderedItems.quantity' }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      {
        $project: {
          brand: '$_id',
          totalSold: 1,
          _id: 0
        }
      }
    ]);

    res.render('dashboard', {
      labels,
      totals,
      topProducts,
      topCategories,
      topBrands,
      filter
    });

  } catch (error) {
    console.error('Dashboard load error:', error);
    res.status(500).send('Server Error');
  }
};

module.exports = { loadDashboard };
  