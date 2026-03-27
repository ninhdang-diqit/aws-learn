package messaging

import (
	"log"
	"sync"

	amqp "github.com/rabbitmq/amqp091-go"
)

var (
	rmqConnInstance    *amqp.Connection
	rmqChannelInstance *amqp.Channel
	rmqOnce            sync.Once
)

func InitRabbitMQ(url string) {
	rmqOnce.Do(func() {
		var err error
		rmqConnInstance, err = amqp.Dial(url)
		if err != nil {
			log.Fatalf("Failed to connect to RabbitMQ: %v", err)
		}

		rmqChannelInstance, err = rmqConnInstance.Channel()
		if err != nil {
			log.Fatalf("Failed to open a channel: %v", err)
		}

		err = rmqChannelInstance.ExchangeDeclare(
			"orders_exchange", // name
			"topic",           // type
			true,              // durable
			false,             // auto-deleted
			false,             // internal
			false,             // no-wait
			nil,               // arguments
		)
		if err != nil {
			log.Fatalf("Failed to declare an exchange: %v", err)
		}
	})
}

func GetChannel() *amqp.Channel {
	if rmqChannelInstance == nil {
		log.Println("RabbitMQ channel is nil. Did you call InitRabbitMQ?")
	}
	return rmqChannelInstance
}

func CloseRabbitMQ() {
	if rmqChannelInstance != nil {
		rmqChannelInstance.Close()
	}
	if rmqConnInstance != nil {
		rmqConnInstance.Close()
	}
}
