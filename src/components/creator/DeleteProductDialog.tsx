import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeleteProduct } from "@/hooks/useProducts";
import { localizeServerMessage } from "@/lib/serverMessages";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";

interface Props {
  product: { id: string; title: string } | null;
  onClose: () => void;
}

type DeleteStatus = { activeBuyers: number; salesClosed: boolean };

/**
 * Deleting a product. While someone can still use it, the product cannot go: the window says so
 * and offers "End sales" (saved at once, closed with a tap outside). Once nobody is left, it asks
 * "Delete for sure?" — that window has a cross and does not close with a tap outside.
 */
const DeleteProductDialog = ({ product, onClose }: Props) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const deleteProduct = useDeleteProduct();
  const [salesClosed, setSalesClosed] = useState(false);
  const [savingSales, setSavingSales] = useState(false);

  const status = useQuery({
    queryKey: ["product-delete-status", product?.id],
    queryFn: () =>
      invokeApi<DeleteStatus>("manage-products", { action: "delete_status", ...creatorCreds(), id: product!.id }),
    enabled: !!product,
    staleTime: 0,
  });

  useEffect(() => {
    if (status.data) setSalesClosed(status.data.salesClosed);
  }, [status.data]);

  const canDelete = status.data?.activeBuyers === 0;

  const toggleSales = async (closed: boolean) => {
    if (!product) return;
    setSalesClosed(closed);
    setSavingSales(true);
    try {
      await invokeApi("manage-products", { action: "set_sales_closed", ...creatorCreds(), id: product.id, closed });
      queryClient.invalidateQueries({ queryKey: ["creator-products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
    } catch (e) {
      setSalesClosed(!closed);
      toast.error(e instanceof Error ? localizeServerMessage(e.message, t) : t("saveFailed"));
    } finally {
      setSavingSales(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    try {
      await deleteProduct.mutateAsync(product.id);
      toast.success(t("productDeleted"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? localizeServerMessage(e.message, t) : t("productDeleteFailed"));
      void status.refetch();
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton
        className="max-w-md rounded-2xl"
        // The "delete for sure" step closes only with the cross, so a stray tap does not lose it.
        onInteractOutside={(e) => canDelete && e.preventDefault()}
      >
        {status.isLoading || !status.data ? (
          <>
            <DialogTitle className="sr-only">{product?.title}</DialogTitle>
            <DialogDescription className="sr-only">…</DialogDescription>
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : canDelete ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogClose
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
                  aria-label={t("close")}
                >
                  <X className="h-4 w-4" />
                </DialogClose>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("changesNotSaved")}</TooltipContent>
            </Tooltip>
            <div className="space-y-2 pr-8">
              <DialogTitle className="text-lg">{t("deleteProductSure")}</DialogTitle>
              <DialogDescription>{t("deleteProductWhat")}</DialogDescription>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={deleteProduct.isPending}
                className="flex h-10 min-w-24 items-center justify-center rounded-xl px-5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-ring disabled:opacity-60"
              >
                {deleteProduct.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("deleteProductSureAction")}
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="text-lg">{t("deleteProductBlocked")}</DialogTitle>
            <DialogDescription className="sr-only">{t("endSales")}</DialogDescription>
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4">
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">{t("endSales")}</span>
                <span className="block text-sm text-muted-foreground">{t("endSalesNote")}</span>
              </span>
              <Switch
                checked={salesClosed}
                disabled={savingSales}
                onCheckedChange={(v) => void toggleSales(v)}
                className="mt-0.5 shrink-0"
              />
            </label>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DeleteProductDialog;
