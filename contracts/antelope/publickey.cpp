#include "publickey.hpp"
#include <string_view>

namespace antelope {

bool DecodeBase58(const char* psz, vector<unsigned char>& vch)
{
   while (*psz && isspace(*psz))
      psz++;
   int zeroes = 0;
   int length = 0;
   while (*psz == '1') {
      zeroes++;
      psz++;
   }
   int                   size = strlen(psz) * 733 / 1000 + 1;
   vector<unsigned char> b256(size);
   static_assert(sizeof(mapBase58) / sizeof(mapBase58[0]) == 256, "mapBase58.size() should be 256");
   while (*psz && !isspace(*psz)) {
      int carry = mapBase58[(uint8_t)*psz];
      if (carry == -1)
         return false;
      int i = 0;
      for (vector<unsigned char>::reverse_iterator it = b256.rbegin();
           (carry != 0 || i < length) && (it != b256.rend()); ++it, ++i) {
         carry += 58 * (*it);
         *it = carry % 256;
         carry /= 256;
      }
      assert(carry == 0);
      length = i;
      psz++;
   }
   while (isspace(*psz))
      psz++;
   if (*psz != 0)
      return false;
   vector<unsigned char>::iterator it = b256.begin() + (size - length);
   while (it != b256.end() && *it == 0)
      it++;
   vch.reserve(zeroes + (b256.end() - it));
   vch.assign(zeroes, 0x00);
   while (it != b256.end())
      vch.push_back(*(it++));
   return true;
}

bool decode_base58(const string& str, vector<unsigned char>& vch)
{
   int estimated_size = str.length() * 733 / 1000 + 1;
   vch.reserve(estimated_size);
   return DecodeBase58(str.c_str(), vch);
}

eosio::public_key stringToLegacyPublicKey(string public_key_str)
{
   string pubkey_prefix("EOS");
   auto   result = mismatch(pubkey_prefix.begin(), pubkey_prefix.end(), public_key_str.begin());
   check(result.first == pubkey_prefix.end(), "Public key should be prefix with EOS");
   auto base58substr = public_key_str.substr(pubkey_prefix.length());

   vector<unsigned char> vch;
   check(decode_base58(base58substr, vch), "Decode pubkey failed");
   check(vch.size() == 37, "Invalid public key");

   array<char, 33> pubkey_data;
   copy_n(vch.begin(), 33, pubkey_data.begin());

   return eosio::public_key(in_place_index<0>, pubkey_data);
}

eosio::public_key stringToPublicKey(string public_key_str)
{
   size_t first = public_key_str.find('_');
   check(first != string::npos, "Invalid public key format");

   size_t second = public_key_str.find('_', first + 1);
   check(second != string::npos, "Invalid public key format");

   string_view prefix(public_key_str.data(), first);
   string_view type(public_key_str.data() + first + 1, second - first - 1);
   string_view key(public_key_str.data() + second + 1, public_key_str.size() - second - 1);

   check(prefix == "PUB", "Public key should be prefix with PUB");

   vector<unsigned char> vch;
   check(decode_base58(string(key), vch), "Decode pubkey failed");
   check(vch.size() >= 33, "Invalid public key size");

   array<char, 33> pubkey_data;
   copy_n(vch.begin(), 33, pubkey_data.begin());

   if (type == "WA") {
      check(vch.size() >= 35, "Invalid WebAuthn public key size");

      eosio::webauthn_public_key::user_presence_t user_presence =
         static_cast<eosio::webauthn_public_key::user_presence_t>(vch[33]);

      uint8_t rpidLength = vch[34];
      check(vch.size() >= 35 + rpidLength, "Invalid WebAuthn public key size");

      string rpid(vch.begin() + 35, vch.begin() + 35 + rpidLength);

      return eosio::public_key(in_place_index<2>, eosio::webauthn_public_key{pubkey_data, user_presence, rpid});
   } else if (type == "R1") {
      return eosio::public_key(in_place_index<1>, pubkey_data);
   } else if (type == "K1") {
      return eosio::public_key(in_place_index<0>, pubkey_data);
   }
   check(false, "Unsupported key type");
   __builtin_unreachable();
}

} // namespace antelope
