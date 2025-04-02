const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; 

    if (!token) {
        return res.status(401).json({ message: "Unauthorized! Please log in." });
    }

    try {
        const decoded = jwt.verify(token, "your_secret_key"); 
        req.user = decoded; 
        next(); 
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
    }
};
