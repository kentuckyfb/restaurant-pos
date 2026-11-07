import { configureStore } from "@reduxjs/toolkit";
import userSlice from "./slices/userSlice";

const store = configureStore({
    reducer: {
        user : userSlice
    },

    devTools: import.meta.env.DEV,
});

export default store;
