package main

import (
	"fmt"

	"stridewars/backend/internal/config"
	"stridewars/backend/internal/routes"
	"stridewars/backend/internal/database"

	"github.com/gin-gonic/gin"
)

func main() {

	cfg := config.Load()

	database.Connect(cfg)

	router := gin.Default()

	routes.Register(router)

	fmt.Println("Server running on port", cfg.Port)

	router.Run(":" + cfg.Port)

}