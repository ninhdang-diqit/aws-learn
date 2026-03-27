package api

import (
	"net/http"
	"strconv"

	"go-template/models"
	"go-template/service"

	"github.com/gin-gonic/gin"
)

var (
	orderSvc   = service.NewOrderService()
	userSvc    = service.NewUserService()
	productSvc = service.NewProductService()
)

func SetupRouter() *gin.Engine {
	r := gin.Default()

	// Orders
	r.POST("/orders", CreateOrderHandler)
	r.GET("/orders/:id", GetOrderHandler)

	// Users
	r.POST("/users", CreateUserHandler)
	r.GET("/users/:id", GetUserHandler)

	// Products
	r.POST("/products", CreateProductHandler)
	r.GET("/products/:id", GetProductHandler)

	return r
}

// Order Handlers
func CreateOrderHandler(c *gin.Context) {
	var order models.Order
	if err := c.ShouldBindJSON(&order); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := orderSvc.CreateOrder(c.Request.Context(), &order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
		return
	}
	c.JSON(http.StatusCreated, order)
}

func GetOrderHandler(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	order, err := orderSvc.GetOrder(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}
	c.JSON(http.StatusOK, order)
}

// User Handlers
func CreateUserHandler(c *gin.Context) {
	var user models.User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := userSvc.CreateUser(c.Request.Context(), &user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func GetUserHandler(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	user, err := userSvc.GetUser(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// Product Handlers
func CreateProductHandler(c *gin.Context) {
	var product models.Product
	if err := c.ShouldBindJSON(&product); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := productSvc.CreateProduct(c.Request.Context(), &product); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create product"})
		return
	}
	c.JSON(http.StatusCreated, product)
}

func GetProductHandler(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	product, err := productSvc.GetProduct(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}
	c.JSON(http.StatusOK, product)
}
