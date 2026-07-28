package routes

import (
	"stridewars/backend/internal/handlers"

	"github.com/gin-gonic/gin"
)

func Register(router *gin.Engine) {

	router.GET("/health", handlers.Health)

}