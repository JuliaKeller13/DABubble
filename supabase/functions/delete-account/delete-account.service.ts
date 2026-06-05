import type { DeleteAccountContext, MessageWithReactions, OwnedChannelRow } from './delete-account.types.ts';

async function reassignOrDeleteOwnedChannels({ adminClient, userId }: DeleteAccountContext): Promise<void> {
  const { data: ownedChannels, error: channelsError } = await adminClient
    .from('channels')
    .select('id')
    .eq('created_by', userId);

  if (channelsError) {
    throw channelsError;
  }

  for (const channel of (ownedChannels ?? []) as OwnedChannelRow[]) {
    const { data: remainingMembers, error: membersError } = await adminClient
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channel.id)
      .neq('user_id', userId)
      .limit(1);

    if (membersError) {
      throw membersError;
    }

    const nextOwnerId = remainingMembers?.[0]?.user_id;

    if (nextOwnerId) {
      const { error: updateError } = await adminClient
        .from('channels')
        .update({ created_by: nextOwnerId })
        .eq('id', channel.id);

      if (updateError) {
        throw updateError;
      }

      continue;
    }

    const { error: deleteChannelMessagesError } = await adminClient
      .from('messages')
      .delete()
      .eq('channel_id', channel.id);

    if (deleteChannelMessagesError) {
      throw deleteChannelMessagesError;
    }

    const { error: deleteMembersError } = await adminClient
      .from('channel_members')
      .delete()
      .eq('channel_id', channel.id);

    if (deleteMembersError) {
      throw deleteMembersError;
    }

    const { error: deleteChannelError } = await adminClient
      .from('channels')
      .delete()
      .eq('id', channel.id);

    if (deleteChannelError) {
      throw deleteChannelError;
    }
  }
}

async function removeUserReactions({ adminClient, userId }: DeleteAccountContext): Promise<void> {
  const { data: messagesWithReactions, error: messagesError } = await adminClient
    .from('messages')
    .select('id, reactions')
    .not('reactions', 'is', null);

  if (messagesError) {
    throw messagesError;
  }

  for (const message of (messagesWithReactions ?? []) as MessageWithReactions[]) {
    if (!message.reactions) {
      continue;
    }

    let hasChanges = false;
    const nextReactions = Object.entries(message.reactions).reduce<Record<string, string[]>>((result, [emoji, userIds]) => {
      const remainingUserIds = userIds.filter((id) => id !== userId);

      if (remainingUserIds.length !== userIds.length) {
        hasChanges = true;
      }

      if (remainingUserIds.length > 0) {
        result[emoji] = remainingUserIds;
      }

      return result;
    }, {});

    if (!hasChanges) {
      continue;
    }

    const { error: updateError } = await adminClient
      .from('messages')
      .update({ reactions: Object.keys(nextReactions).length > 0 ? nextReactions : null })
      .eq('id', message.id);

    if (updateError) {
      throw updateError;
    }
  }
}

async function removeUserMemberships({ adminClient, userId }: DeleteAccountContext): Promise<void> {
  const { error } = await adminClient
    .from('channel_members')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

async function removeUserProfile({ adminClient, userId }: DeleteAccountContext): Promise<void> {
  const { error } = await adminClient
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

async function removeAuthUser({ adminClient, userId }: DeleteAccountContext): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}

export async function deleteAccount(context: DeleteAccountContext): Promise<void> {
  await reassignOrDeleteOwnedChannels(context);
  await removeUserReactions(context);
  await removeUserMemberships(context);
  await removeUserProfile(context);
  await removeAuthUser(context);
}
