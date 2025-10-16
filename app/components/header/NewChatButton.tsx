import { useCallback, useState } from 'react';
import { PlusIcon } from '@radix-ui/react-icons';
import { Button } from '@ui/Button';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useChatId } from '~/lib/stores/chatId';
import { useConvexSessionIdOrNullOrLoading } from '~/lib/stores/sessionId';
import { subchatIndexStore } from '~/lib/stores/subchats';
import { messageInputStore } from '~/lib/stores/messageInput';
import { useAreFilesSaving } from '~/lib/stores/fileUpdateCounter';
import { toast } from 'sonner';

export function NewChatButton() {
  const [isCreating, setIsCreating] = useState(false);
  const chatId = useChatId();
  const sessionId = useConvexSessionIdOrNullOrLoading();
  const createSubchat = useMutation(api.subchats.create);
  const areFilesSaving = useAreFilesSaving();

  const handleCreateNewChat = useCallback(async () => {
    if (!sessionId || areFilesSaving) {
      return;
    }

    try {
      setIsCreating(true);
      const subchatIndex = await createSubchat({ chatId, sessionId });
      subchatIndexStore.set(subchatIndex);
      messageInputStore.set('');
      toast.success('New chat created!');
    } catch (error) {
      console.error('Failed to create new chat:', error);
      toast.error('Failed to create new chat. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [createSubchat, chatId, sessionId, areFilesSaving]);

  return (
    <Button
      onClick={handleCreateNewChat}
      disabled={!sessionId || areFilesSaving || isCreating}
      variant="neutral"
      size="xs"
      icon={<PlusIcon />}
      tip="Create a new chat while preserving your current work"
    >
      New Chat
    </Button>
  );
}

