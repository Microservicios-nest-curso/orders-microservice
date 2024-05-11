import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto, ChangeOrderStatusDto } from './dto';
import { OrderStatus, PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PaginationDto } from 'src/common';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');
  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Database connected")
  }


  async create(createOrderDto: CreateOrderDto) {
    try {
      const ids = createOrderDto.items.map(x => x.productId);

      const products: any[] = await firstValueFrom(this.client.send({ cmd: 'validate-products' }, ids));

      let totalAmount = 0;
      for (const item of createOrderDto.items) {
        const product = products.find(x => x.id === item.productId);
        totalAmount += product.price * item.quantity;
      }

      const ordenCreated = await this.order.create({
        data: {
          totalItems: products.length,
          totalAmount, status: OrderStatus.PENDING,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map(item => ({
                quantity: item.quantity,
                productId: item.productId,
                price: products.find(x => x.id === item.productId).price,
              }))
            }
          }
        },
        include: {
          OrderItem: {
            select: { price: true, quantity: true, productId: true }
          }
        }
      })




      return {
        ...ordenCreated,
        OrderItem: ordenCreated.OrderItem.map(item => ({
          ...item,
          name: products.find(x => x.id === item.productId).name
        }))
      }
    } catch (error) {
      throw new RpcException(error)
    }




  }

  async findAll(pagination: OrderPaginationDto) {
    const { page, limit, status } = pagination;
    const totalPages = await this.order.count({ where: { status } });
    const lastPage = Math.ceil(totalPages / limit);
    const data = await this.order.findMany({
      skip: (page - 1) * limit,
      take: limit,
      where: { status }
    })


    return {
      data,
      meta: {
        page,
        totalPages,
        lastPage
      }
    }
  }

  async findOne(id: string) {
    const order = await this.order.findUnique({ where: { id }, include: { OrderItem: true } })

    if (!order) throw new RpcException({
      message: `No found order by id #${id}`,
      status: HttpStatus.NOT_FOUND
    });

    const ids = order.OrderItem.map(x => x.productId);
    const products: any[] = await firstValueFrom(this.client.send({ cmd: 'validate-products' }, ids));
    return {
      ...order,
      OrderItem: order.OrderItem.map(item => ({
        ...item,
        name: products.find(x => x.id === item.productId).name
      }))
    };
  }

  async changeOrderStatus(changeStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeStatusDto;
    const order = await this.findOne(id);
    if (order.status === status) return order;
    return this.order.update({
      where: { id },
      data: { status }
    })
  }


}
