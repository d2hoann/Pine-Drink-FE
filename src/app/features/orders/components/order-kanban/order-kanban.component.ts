import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Order, OrderStatus } from '../../models/order.model';

@Component({
  selector: 'app-order-kanban',
  templateUrl: './order-kanban.component.html',
  styleUrls: ['./order-kanban.component.scss']
})
export class OrderKanbanComponent {
  @Input() orders: Order[] = [];
  @Output() cardClick = new EventEmitter<Order>();
  @Output() statusChange = new EventEmitter<{order: Order, status: OrderStatus}>();

  columns: { label: string; status: OrderStatus }[] = [
    { label: 'PENDING', status: 'PENDING' },
    { label: 'Đã xác nhận', status: 'CONFIRMED' },
    { label: 'Đang pha chế', status: 'PREPARING' },
    { label: 'Đã chuẩn bị', status: 'READY' }
  ];

  getOrdersByStatus(status: OrderStatus): Order[] {
    return this.orders.filter(o => o.status === status);
  }
}

