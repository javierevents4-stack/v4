interface MercadoPagoItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

interface MercadoPagoPreference {
  items: MercadoPagoItem[];
  payer: {
    name: string;
    email: string;
    phone?: {
      number: string;
    };
  };
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  auto_return: string;
  external_reference: string;
  notification_url?: string;
}

export class MercadoPagoService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.PROD 
      ? window.location.origin 
      : 'http://localhost:5173';
  }

  async createPreference(bookingData: any): Promise<{ id: string; init_point: string }> {
    try {
      // Calculate total amount
      const servicesTotal = (bookingData.cartItems || []).reduce((sum: number, item: any) => {
        const itemPrice = Number(item.price.replace(/[^0-9]/g, '')) / 100;
        const itemTotal = itemPrice * item.quantity;
        
        // Apply coupon discounts
        const coupon = bookingData[`discountCoupon_${bookingData.cartItems?.indexOf(item)}`];
        if (coupon === 'FREE' && item.id && item.id.includes('prewedding') && !item.id.includes('teaser')) {
          return sum; // FREE coupon makes the item free
        }
        
        return sum + itemTotal;
      }, 0);

      const storeTotal = (bookingData.storeItems || []).reduce((sum: number, item: any) => {
        return sum + (item.price * item.quantity);
      }, 0);

      const subtotal = servicesTotal + storeTotal + (bookingData.travelCost || 0);
      const paymentDiscount = bookingData.paymentMethod === 'cash' ? subtotal * 0.05 : 0;
      const totalAmount = subtotal - paymentDiscount;

      // Calculate deposit (20% of services + 50% of store items)
      const servicesDeposit = servicesTotal * 0.2;
      const storeDeposit = storeTotal * 0.5;
      const depositAmount = servicesDeposit + storeDeposit;

      // Prepare items for Mercado Pago
      const items: MercadoPagoItem[] = [];

      // Add deposit item
      if (depositAmount > 0) {
        items.push({
          title: `Sinal - Wild Pictures Studio (${bookingData.eventType})`,
          quantity: 1,
          unit_price: Math.round(depositAmount * 100) / 100,
          currency_id: 'BRL'
        });
      }

      // If no deposit (store only), add full amount
      if (depositAmount === 0 && totalAmount > 0) {
        items.push({
          title: `Serviços Adicionais - Wild Pictures Studio`,
          quantity: 1,
          unit_price: Math.round(totalAmount * 100) / 100,
          currency_id: 'BRL'
        });
      }

      const preference: MercadoPagoPreference = {
        items,
        payer: {
          name: bookingData.name,
          email: bookingData.email,
          phone: bookingData.phone ? {
            number: bookingData.phone.replace(/\D/g, '')
          } : undefined
        },
        back_urls: {
          success: `${this.baseUrl}/booking?payment=success`,
          failure: `${this.baseUrl}/booking?payment=failure`,
          pending: `${this.baseUrl}/booking?payment=pending`
        },
        auto_return: 'approved',
        external_reference: `booking_${Date.now()}`,
        notification_url: `${this.baseUrl}/api/mercadopago/webhook`
      };

      const token = (typeof window !== 'undefined') ? localStorage.getItem('mp_access_token') : '';
      const response = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preference,
          bookingData,
          accessToken: token || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao criar preferência de pagamento');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro no Mercado Pago:', error);
      throw error;
    }
  }
}

export const mercadoPago = new MercadoPagoService();
