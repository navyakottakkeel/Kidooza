const Order = require("../../models/orderSchema");
const moment = require("moment");
const excelJS = require("exceljs");
const PDFDocument = require("pdfkit");


const ORDERS_PER_PAGE = 10; 

// ✅ Sales Report Page
const getSalesReportPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ORDERS_PER_PAGE;

    const today = moment().startOf("day");
    const tomorrow = moment(today).endOf("day");

    const matchQuery = { paymentStatus: "Paid", createdAt: { $gte: today, $lte: tomorrow } };

    const totalOrders = await Order.countDocuments(matchQuery);
    const orders = await Order.find(matchQuery)
    .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(ORDERS_PER_PAGE)
      .lean();

      const reportData = calculateReport(await Order.find(matchQuery).lean());

      const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    res.render("sales-report", { orders, moment, reportData, filters: { range: "Today" }, page,totalPages, skip  });
  } catch (err) {
    console.error("Error loading sales report:", err);
    res.status(500).send("Server Error");
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

// ✅ Filter Sales Report

const filterSalesReport = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1; // current page from query
      const skip = (page - 1) * ORDERS_PER_PAGE;
  
      const { type, startDate, endDate } = req.query;
  
      let matchQuery = { paymentStatus: "Paid" };
  
      if (type === "daily") {
        matchQuery.createdAt = {
          $gte: moment().startOf("day").toDate(),
          $lte: moment().endOf("day").toDate()
        };
      } else if (type === "weekly") {
        matchQuery.createdAt = {
          $gte: moment().startOf("week").toDate(),
          $lte: moment().endOf("week").toDate()
        };
      } else if (type === "monthly") {
        matchQuery.createdAt = {
          $gte: moment().startOf("month").toDate(),
          $lte: moment().endOf("month").toDate()
        };
      } else if (type === "custom" && startDate && endDate) {
        matchQuery.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
  
      // ✅ Get total count for pagination
      const totalOrders = await Order.countDocuments(matchQuery);
      const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
  
      // ✅ Fetch only the orders for the current page
      const orders = await Order.find(matchQuery)
      .populate("user", "name email")
        .sort({ createdAt: -1 }) // latest orders first
        .skip(skip)
        .limit(ORDERS_PER_PAGE)
        .lean();
  
      const reportData = calculateReport(await Order.find(matchQuery).lean());
  
      res.render("sales-report", {
        orders,
        moment,
        reportData,
        filters: { type, startDate, endDate },
        page,
        totalPages,
        skip
      });
    } catch (err) {
      console.error("Error filtering sales report:", err);
      res.status(500).send("Server Error");
    }
  };

  
/////////////////////////////////////////////////////////////////////////////////////////////////////

// ✅ Helper: Calculate Report Totals
function calculateReport(orders) {
  let totalSales = orders.length;
  let totalAmount = 0;
  let totalDiscount = 0;

  orders.forEach(order => {
    totalAmount += order.finalAmount || 0;
    totalDiscount += order.discount || 0;
  });

  return { totalSales, totalAmount, totalDiscount };
}

/////////////////////////////////////////////////////////////////////////////////////////////////////

// ✅ Download Report
const downloadSalesReport = async (req, res) => {
    try {
      const { type } = req.params; // pdf or excel
      const { type: filterType, startDate, endDate } = req.query;
  
      let matchQuery = { paymentStatus: "Paid" };
  
      if (filterType === "daily") {
        matchQuery.createdAt = {
          $gte: moment().startOf("day").toDate(),
          $lte: moment().endOf("day").toDate()
        };
      } else if (filterType === "weekly") {
        matchQuery.createdAt = {
          $gte: moment().startOf("week").toDate(),
          $lte: moment().endOf("week").toDate()
        };
      } else if (filterType === "monthly") {
        matchQuery.createdAt = {
          $gte: moment().startOf("month").toDate(),
          $lte: moment().endOf("month").toDate()
        };
      } else if (filterType === "custom" && startDate && endDate) {
        matchQuery.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
  
      const orders = await Order.find(matchQuery).lean();
      const reportData = calculateReport(orders);
  
      if (type === "excel") {
        const workbook = new excelJS.Workbook();
        const worksheet = workbook.addWorksheet("Sales Report");
  
        worksheet.columns = [
          { header: "Order ID", key: "orderId", width: 25 },
          { header: "Date", key: "date", width: 20 },
          { header: "Amount", key: "amount", width: 15 },
          { header: "Discount", key: "discount", width: 15 }
        ];
  
        orders.forEach(order => {
          worksheet.addRow({
            orderId: order.orderId,
            date: moment(order.createdAt).format("YYYY-MM-DD"),
            amount: order.finalAmount,
            discount: order.discount || 0
          });
        });
  
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=sales-report.xlsx"
        );
  
        return workbook.xlsx.write(res).then(() => res.end());
      }
  
      if (type === "pdf") {
        const doc = new PDFDocument({
          size: "A4",
          layout: "portrait",
          margin: 50
        });
      
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=sales-report.pdf"
        );
        doc.pipe(res);
      
        // --- PDF Header ---
        doc.fontSize(20).fillColor("#333").text("Sales Report", { align: "center" });
        doc.moveDown();
      
        // --- Summary Cards ---
        doc.fontSize(14).fillColor("black");
        doc.text(`Total Orders: ${reportData.totalSales}`, { continued: true }).text(`    `);
        doc.text(`Total Amount: ₹${reportData.totalAmount}`, { continued: true }).text(`    `);
        doc.text(`Total Discount: ₹${reportData.totalDiscount}`);
        doc.moveDown(2);
      
        // --- Table Header ---
        const tableTop = doc.y;
        const pageWidth = doc.page.width - doc.options.margin * 2; // full width inside margins
        const col1 = 0;
        const col2 = pageWidth * 0.5;
        const col3 = pageWidth * 0.70;
        const col4 = pageWidth * 0.86;
      
        doc.font("Helvetica-Bold").fontSize(12);
        doc.text("Order ID", doc.options.margin + col1, tableTop);
        doc.text("Date", doc.options.margin + col2, tableTop);
        doc.text("Amount", doc.options.margin + col3, tableTop);
        doc.text("Discount", doc.options.margin + col4, tableTop);
        doc.moveDown();
      
        doc.font("Helvetica");
      
        // --- Table Rows ---
        orders.forEach(order => {
          const y = doc.y;
          doc.text(order.orderId, doc.options.margin + col1, y);
          doc.text(moment(order.createdAt).format("YYYY-MM-DD"), doc.options.margin + col2, y);
          doc.text(`₹${order.finalAmount}`, doc.options.margin + col3, y);
          doc.text(`₹${order.discount || 0}`, doc.options.margin + col4, y);
          doc.moveDown();
        });
      
        doc.end();
      }
      
      
    } catch (err) {
      console.error("Error downloading sales report:", err);
      res.status(500).send("Server Error");
    }
  };
  
  

module.exports = {
  getSalesReportPage,
  filterSalesReport,
  downloadSalesReport
};
