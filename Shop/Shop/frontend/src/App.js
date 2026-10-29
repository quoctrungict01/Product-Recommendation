import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getCategories } from "./services/Api";
import { Provider } from "react-redux";
import store from "./redux-setup/store";

// Import Layout
import DefaultLayout from "./shared/components/Layout/DefaultLayout";

// Import Pages
import Home from "./pages/Home";
import Category from "./pages/Category";
import ProductDetails from "./pages/ProductDetails";
import Search from "./pages/Search";
import Cart from "./pages/Cart";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";

const App = () => {
  // eslint-disable-next-line
  const [categories, setCategories] = React.useState([]);
  React.useEffect(() => {
    getCategories().then(({data})=>{
      setCategories(data.data.docs);
    });
  }, []);

  return (
    <Provider store={store}>
      <BrowserRouter>
          <Routes>
            <Route path="/" element={<DefaultLayout />}>
              <Route index element={<Home />} />
              <Route path="/Category-:id" element={<Category />} />
              <Route
                path="/ProductDetails-:id"
                element={<ProductDetails />}
              />
              <Route path="/Search" element={<Search />} />
              <Route path="/Cart" element={<Cart />} />
              <Route path="/Success" element={<Success />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/login" element={<Login/>} />
            <Route path="/register" element={<Register/>} />
          </Routes>
            
      </BrowserRouter>
    </Provider>
  );
};

export default App;