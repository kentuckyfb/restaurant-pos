import { axiosWrapper } from "./axiosWrapper";

// Every helper resolves to the response's `data` payload
const get = (url, params) => axiosWrapper.get(url, { params }).then((r) => r.data);
const post = (url, body) => axiosWrapper.post(url, body).then((r) => r.data);
const put = (url, body) => axiosWrapper.put(url, body).then((r) => r.data);
const patch = (url, body) => axiosWrapper.patch(url, body).then((r) => r.data);
const del = (url) => axiosWrapper.delete(url).then((r) => r.data);

// Auth & staff
export const getSetupStatus = () => get("/api/user/setup");
export const login = (data) => post("/api/user/login", data);
export const register = (data) => post("/api/user/register", data);
export const getUserData = () => get("/api/user");
export const logout = () => post("/api/user/logout");
export const getStaff = () => get("/api/user/staff");
export const createStaff = (data) => post("/api/user/staff", data);
export const updateStaff = ({ id, ...data }) => put(`/api/user/staff/${id}`, data);

// Settings
export const getSettings = () => get("/api/settings");
export const updateSettings = (data) => put("/api/settings", data);

// Menu
export const getMenu = () => get("/api/menu");
export const createCategory = (data) => post("/api/menu/categories", data);
export const updateCategory = ({ id, ...data }) => put(`/api/menu/categories/${id}`, data);
export const deleteCategory = (id) => del(`/api/menu/categories/${id}`);
export const createMenuItem = (data) => post("/api/menu/items", data);
export const updateMenuItem = ({ id, ...data }) => put(`/api/menu/items/${id}`, data);
export const deleteMenuItem = (id) => del(`/api/menu/items/${id}`);

// Tables
export const getTables = () => get("/api/table");
export const addTable = (data) => post("/api/table", data);
export const updateTable = ({ id, ...data }) => put(`/api/table/${id}`, data);
export const deleteTable = (id) => del(`/api/table/${id}`);

// Orders
export const getOrders = (params) => get("/api/order", params);
export const getOrder = (id) => get(`/api/order/${id}`);
export const createOrder = (data) => post("/api/order", data);
export const updateOrder = ({ id, ...data }) => put(`/api/order/${id}`, data);
export const updateKitchenStatus = ({ id, kitchenStatus }) => patch(`/api/order/${id}/kitchen`, { kitchenStatus });
export const payOrder = ({ id, ...data }) => post(`/api/order/${id}/pay`, data);
export const cancelOrder = ({ id, reason }) => post(`/api/order/${id}/cancel`, { reason });
export const moveOrderTable = ({ id, tableId }) => post(`/api/order/${id}/table`, { tableId });
export const joinOrderTable = ({ id, tableId }) => post(`/api/order/${id}/join`, { tableId });
export const mergeOrders = ({ id, sourceOrderId }) => post(`/api/order/${id}/merge`, { sourceOrderId });
export const refundOrder = ({ id, ...data }) => post(`/api/order/${id}/refund`, data);
export const sendReceipt = ({ id, channel, to }) => post(`/api/order/${id}/receipt`, { channel, to });
export const getPublicReceipt = (token) => get(`/api/public/receipt/${token}`);

// Shifts
export const getCurrentShift = () => get("/api/shift/current");
export const getShifts = () => get("/api/shift");
export const getShift = (id) => get(`/api/shift/${id}`);
export const openShift = (data) => post("/api/shift/open", data);
export const closeShift = (data) => post("/api/shift/close", data);

// Inventory
export const getInventory = () => get("/api/inventory");
export const getStockMovements = (params) => get("/api/inventory/movements", params);
export const createInventoryItem = (data) => post("/api/inventory", data);
export const updateInventoryItem = ({ id, ...data }) => put(`/api/inventory/${id}`, data);
export const deleteInventoryItem = (id) => del(`/api/inventory/${id}`);
export const adjustStock = ({ id, ...data }) => post(`/api/inventory/${id}/adjust`, data);

// Reports & backup
export const getSalesReport = (params) => get("/api/report/sales", params);
export const exportBackup = () => axiosWrapper.get("/api/backup/export", { responseType: "blob" });
export const restoreBackup = (data) => post("/api/backup/restore", data);

// Storage & order archives
export const getStorage = () => get("/api/backup/storage");
export const previewArchive = (before) => get("/api/backup/archive/preview", { before });
export const downloadArchive = (before) =>
  axiosWrapper.get("/api/backup/archive/export", { params: { before }, responseType: "blob", timeout: 0 });
export const purgeArchive = (data) => post("/api/backup/archive/purge", data);

// Customers (built from order details)
export const getCustomers = (params) => get("/api/customers", params);
export const getCustomerOrders = (key) => get("/api/customers/orders", { key });
