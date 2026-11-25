/**
 * Feature flag: "Minhas Coletâneas" na Central de Mídia (paridade com o app).
 *
 * TODO(minhas-coletaneas): desligado em 20/11/2026 porque o recurso ainda
 * não está pronto. A seção deve ir para a aba Comunidade; rever depois se
 * ela volta a aparecer na Central de Mídia, e então religar esta flag (ou
 * removê-la junto com a seção daqui).
 *
 * Com a flag desligada, a Central não busca as coletâneas na API e esconde
 * o botão da barra, o modal e a seção.
 */
export const SHOW_CUSTOM_COLLECTIONS = false
