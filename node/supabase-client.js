const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://thbpolmvhpmpflbxhtca.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYnBvbG12aHBtcGZsYnhodGNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTAwMTI0MiwiZXhwIjoyMDc0NTc3MjQyfQ.ydJ59gs24qKK49TyXApJwuPpVSGmd-rtVKmSp_69pP0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Function to save Plaid item to Supabase
async function savePlaidItem(itemData) {
  try {
    const { data, error } = await supabase
      .from('plaid_items')
      .upsert({
        plaid_item_id: itemData.item_id,
        plaid_access_token: itemData.access_token,
        institution_id: itemData.institution?.institution_id,
        institution_name: itemData.institution?.name,
        workspace_id: itemData.workspace_id,
        user_id: itemData.user_id,
        status: 'active',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'plaid_item_id'
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving Plaid item:', error);
    throw error;
  }
}

// Function to save accounts to Supabase
async function saveAccounts(accounts, itemId, workspaceId) {
  try {
    // Get the plaid_items record to get the UUID id
    const { data: plaidItem } = await supabase
      .from('plaid_items')
      .select('id')
      .eq('plaid_item_id', itemId)
      .single();

    if (!plaidItem) {
      throw new Error('Plaid item not found');
    }

    const accountsData = accounts.map(account => ({
      plaid_account_id: account.account_id,
      workspace_id: workspaceId,
      plaid_item_id: plaidItem.id,
      name: account.name,
      official_name: account.official_name,
      type: account.type,
      subtype: account.subtype,
      mask: account.mask,
      current_balance: account.balances?.current,
      available_balance: account.balances?.available,
      currency_code: account.balances?.iso_currency_code || 'USD',
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('accounts')
      .upsert(accountsData, {
        onConflict: 'plaid_account_id'
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving accounts:', error);
    throw error;
  }
}

// Function to save transactions to Supabase
async function saveTransactions(transactions, workspaceId) {
  try {
    // Get account mappings
    const accountIds = [...new Set(transactions.map(t => t.account_id))];
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, plaid_account_id')
      .in('plaid_account_id', accountIds);

    const accountMap = {};
    accounts?.forEach(acc => {
      accountMap[acc.plaid_account_id] = acc.id;
    });

    const transactionsData = transactions.map(transaction => ({
      plaid_transaction_id: transaction.transaction_id,
      workspace_id: workspaceId,
      account_id: accountMap[transaction.account_id],
      amount: transaction.amount,
      date: transaction.date,
      name: transaction.name,
      merchant_name: transaction.merchant_name,
      category: transaction.category,
      pending: transaction.pending || false,
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('transactions')
      .upsert(transactionsData, {
        onConflict: 'plaid_transaction_id'
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving transactions:', error);
    throw error;
  }
}

// Function to get or create workspace
async function getOrCreateWorkspace(userId) {
  try {
    // First check if user has a workspace
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      return existingMember.workspace_id;
    }

    // Create a new workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: 'Personal Workspace',
        type: 'personal',
        slug: `personal-${userId.substring(0, 8)}`
      })
      .select()
      .single();

    if (workspaceError) throw workspaceError;

    // Add user as owner
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner'
      });

    if (memberError) throw memberError;

    return workspace.id;
  } catch (error) {
    console.error('Error getting/creating workspace:', error);
    throw error;
  }
}

module.exports = {
  supabase,
  savePlaidItem,
  saveAccounts,
  saveTransactions,
  getOrCreateWorkspace
};