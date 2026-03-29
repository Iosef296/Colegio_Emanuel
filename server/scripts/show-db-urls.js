// Solo para obtener las URLs actuales de los secrets
console.log('PRIMARY:', process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@'));
console.log('SECONDARY:', process.env.DATABASE_URL_SECONDARY?.replace(/:([^:@]+)@/, ':***@'));
