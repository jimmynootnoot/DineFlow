import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import CartRecommendations from '../menu/CartRecommendations';
import BillingControls from '../orders/BillingControls';
import { getRecommendations } from '../../services/recommendationService';
import { supabase } from '../../services/supabase';
import { recordPayment } from '../../services/reportService';

jest.mock('../../services/recommendationService',()=>({getRecommendations:jest.fn()}));
jest.mock('../../services/supabase',()=>({supabase:{rpc:jest.fn()}}));
jest.mock('../../services/reportService',()=>({recordPayment:jest.fn()}));

test('accepting a mined combo adds its actual menu items',async()=>{
  const menu=[{id:'rice',name:'Rice',price:20,available:true,stock:10},{id:'tea',name:'Tea',price:25,available:true,stock:10}];
  getRecommendations.mockResolvedValue([{id:'rule',items:menu,reason:'Paired with Sisig',source:'simulated'}]);
  const add=jest.fn();render(<CartRecommendations cart={[{id:'sisig'}]} menu={menu} onAdd={add}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Rice \+ Tea/}));
  expect(add.mock.calls.map(call=>call[0].id)).toEqual(['rice','tea']);
  expect(screen.getByText(/simulated validation data/)).toBeInTheDocument();
});

test('a failed recommendation service leaves ordering available',async()=>{
  getRecommendations.mockRejectedValue(new Error('offline'));
  render(<CartRecommendations cart={[{id:'sisig'}]} menu={[]} onAdd={jest.fn()}/>);
  expect(await screen.findByRole('status')).toHaveTextContent('You can continue ordering');
});

test('discount requires staff verification and cash records tendered amount',async()=>{
  supabase.rpc.mockResolvedValue({error:null});recordPayment.mockResolvedValue({changeDue:50});
  render(<BillingControls order={{id:'order',totalAmount:100,subtotal:112,status:'served',paymentStatus:'unpaid'}}/>);
  fireEvent.change(screen.getByLabelText('Statutory discount'),{target:{value:'senior'}});
  expect(screen.getByRole('button',{name:'Apply discount'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Eligible portion/),{target:{value:'112'}});
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Apply discount'}));
  await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('apply_order_discount',{p_order_id:'order',p_type:'senior',p_eligible_amount:112}));
  await screen.findByText(/Discount saved/);
  fireEvent.change(screen.getByLabelText(/Cash tendered/),{target:{value:'150'}});fireEvent.click(screen.getByRole('button',{name:'Record cash payment'}));
  expect(await screen.findByText(/Change: ₱50.00/)).toBeInTheDocument();
  expect(recordPayment).toHaveBeenCalledWith({orderId:'order',method:'CASH',amount:150});
});
