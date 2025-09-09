export const formatPrice = (price: number): string => {
  return (price / 100).toFixed(2);
};

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('pt-BR');
};