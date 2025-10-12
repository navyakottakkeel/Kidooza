const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

// Helper to get sales data grouped by date range
const getSalesData = async (filter) => {
  let groupId;
  let dateFormat;

  if (filter === "yearly") {
    groupId = { year: { $year: "$createdAt" } };
    dateFormat = "%Y";
  } else if (filter === "monthly") {
    groupId = { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } };
    dateFormat = "%Y-%m";
  } else if (filter === "weekly") {
    groupId = {  week: { $week: "$createdAt" }, year: { $year: "$createdAt" } };
    dateFormat = "%Y-%W";
  } else {
    // Default to daily
    groupId = { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
    dateFormat = "%d-%m-%Y";
  }

  const sales = await Order.aggregate([
    { $match: { "paymentStatus": "Paid" } },
    {
      $group: {
        _id: groupId,
        totalSales: { $sum: "$finalAmount" },
      },
    },
    { $sort: { "_id": 1 } },
  ]);

  return sales.map((s) => ({
    date: Object.values(s._id).join("-"),
    total: s.totalSales,
  }));
};

// Top 10 best-selling products, categories, brands
const getTopSellingData = async () => {
  const productSales = await Order.aggregate([
    { $unwind: "$orderedItems" },
    {
      $group: {
        _id: "$orderedItems.product",
        totalQty: { $sum: "$orderedItems.quantity" },
      },
    },
    { $sort: { totalQty: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    { $project: { name: "$product.productName", totalQty: 1 } },
  ]);

  const categorySales = await Order.aggregate([
    { $unwind: "$orderedItems" },
    {
      $lookup: {
        from: "products",
        localField: "orderedItems.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $lookup: {
        from: "categories",
        localField: "product.category",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $group: {
        _id: "$category.name",
        totalQty: { $sum: "$orderedItems.quantity" },
      },
    },
    { $sort: { totalQty: -1 } },
    { $limit: 4 },
  ]);

  const brandSales = await Order.aggregate([
    { $unwind: "$orderedItems" },
    {
      $lookup: {
        from: "products",
        localField: "orderedItems.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $group: {
        _id: "$product.brand",
        totalQty: { $sum: "$orderedItems.quantity" },
      },
    },
    { $sort: { totalQty: -1 } },
    { $limit: 4 },
  ]);

  return { productSales, categorySales, brandSales };
};   

exports.loadDashboard = async (req, res) => {
  try {
    const filter = req.query.filter || "monthly";
    const salesData = await getSalesData(filter);
    const { productSales, categorySales, brandSales } = await getTopSellingData();

    res.render("dashboard", {
      salesData,
      productSales,
      categorySales,
      brandSales,
      filter,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("Error loading dashboard");
  }
};
  