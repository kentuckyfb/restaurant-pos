import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    _id: "",
    name: "",
    email : "",
    phone: "",
    role: "",
    isAuth: false
}

const userSlice = createSlice({
    name: "user",
    initialState,
    reducers: {
        setUser: (state, action) => {
            if (!action.payload) {
                state._id = "";
                state.name = "";
                state.phone = "";
                state.email = "";
                state.role = "";
                state.isAuth = false;
                return;
            }
            const { _id, name, phone, email, role } = action.payload;
            state._id = _id || "";
            state.name = name || "";
            state.phone = phone || "";
            state.email = email || "";
            state.role = role || "";
            state.isAuth = Boolean(_id);
        },

        removeUser: (state) => {
            state._id = "";
            state.email = "";
            state.name = "";
            state.phone = "";
            state.role = "";
            state.isAuth = false;
        }
    }
})

export const { setUser, removeUser } = userSlice.actions;
export default userSlice.reducer;
