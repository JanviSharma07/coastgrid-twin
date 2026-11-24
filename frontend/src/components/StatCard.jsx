import { motion } from "framer-motion";

export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  color
}) {
  return (
    <motion.div
      className="stat-card"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.2 }}
    >
      <div className="stat-top">
        <span>{title}</span>

        <div className="stat-icon" style={{ color }}>
          <Icon size={21} />
        </div>
      </div>

      <h2>{value}</h2>

      <p>{description}</p>
    </motion.div>
  );
}