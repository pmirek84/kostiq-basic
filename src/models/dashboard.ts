export interface AppNotification {
    id: string;
    type: 'offer_waiting' | 'offer_rejected' | 'job_delay' | 'invoice_overdue' | 'new_client' | 'system' | 'site_log';
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
    relatedEntityType?: 'offer' | 'job' | 'invoice' | 'client';
    relatedEntityId?: string;
}
