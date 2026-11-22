-- Run in the SQL editor: every check runs inside a block that is rolled back at the end.
-- Expected message: TEST (rolled back): check ok · totals 30/3/3/30 · options kept · wrong token null · code reuse refused · visit dedup 1 · backup rows > 0
do $$ declare b uuid; p uuid; z uuid; oid uuid; tok uuid := gen_random_uuid(); r text := ''; j jsonb; n int; begin
 select pr.business_id, pr.id into b, p from mc_saas_products pr join mc_saas_businesses bz on bz.id=pr.business_id and bz.is_published where pr.is_active limit 1;
 update mc_saas_products set price1=10, price2=null, sale_price1=null, availability='in_stock' where id=p;
 insert into mc_saas_delivery_zones(business_id,name,fee,free_over) values (b,'Beirut',3,50) returning id into z;
 insert into mc_saas_discount_codes(business_id,code,kind,value,max_uses) values (b,'WELCOME10','percent',10,1);
 j := mc_saas_check_discount(b,'welcome10',30); r := 'check='||j::text;
 perform set_config('request.jwt.claims', '{"role":"anon"}', true);
 oid := gen_random_uuid();
 insert into mc_saas_orders(id,business_id,customer_name,customer_phone,items,delivery_zone_id,discount_code,payment_method,language,public_token)
 values (oid,b,'Test','76000001', jsonb_build_array(jsonb_build_object('product_id',p,'quantity',3,'unit_index',1,'options','Size: L')), z,'welcome10','whish','ar',tok);
 j := mc_saas_track_order(oid, tok);
 r := r||' | subtotal='||(j->>'subtotal')||' discount='||(j->>'discount_amount')||' delivery='||(j->>'delivery_fee')||' total='||(j->>'total')||' options='||(j->'items'->0->>'options');
 r := r||' | wrong token -> '||coalesce(mc_saas_track_order(oid, gen_random_uuid())::text,'null');
 begin insert into mc_saas_orders(business_id,customer_name,customer_phone,items,discount_code) values (b,'T2','76000002', jsonb_build_array(jsonb_build_object('product_id',p,'quantity',1,'unit_index',1)),'WELCOME10'); r := r||' | reuse ACCEPTED (BUG)';
 exception when others then r := r||' | reuse refused: '||sqlerrm; end;
 perform mc_saas_track(b,'visit',null,'sess-test-123456','google.com'); perform mc_saas_track(b,'visit',null,'sess-test-123456','google.com');
 select count(*) into n from mc_saas_events where session='sess-test-123456'; r := r||' | visit dedup='||n;
 n := mc_saas_nightly_backup(); select count(*) into n from mc_backup.daily_snapshots where snapshot_date=current_date; r := r||' | backup rows='||n;
 raise exception 'TEST (rolled back): %', r;
end $$;
